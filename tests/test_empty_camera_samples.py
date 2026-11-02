"""Real MP4 regression for the camera's timed zero-byte video samples."""
import struct
import tempfile
import unittest
from pathlib import Path
import av
import numpy as np
from analyzer import VideoReader, analyze_video, prepare_baseline
import threading


def box(kind, data):
    return struct.pack('>I4s', len(data)+8, kind) + data


def children(data):
    offset = 0
    while offset < len(data):
        size, kind = struct.unpack_from('>I4s', data, offset)
        if size < 8 or offset+size > len(data):
            raise ValueError('Invalid test MP4 box')
        yield kind, data[offset+8:offset+size]
        offset += size


def insert_empty_samples(path):
    """Give every sample its own chunk, then mark frames 3..10 empty.

    The encoded image bytes remain untouched. Rebuilding a moov located AFTER
    mdat does not move the absolute sample offsets. This reproduces the camera
    table without checking in large/binary/user video fixtures.
    """
    raw = path.read_bytes()
    stbl = None

    def find(data):
        nonlocal stbl
        for kind, payload in children(data):
            if kind == b'stbl':
                stbl = dict(children(payload))
            elif kind in (b'moov', b'trak', b'mdia', b'minf'):
                find(payload)
    find(raw)
    sz = stbl[b'stsz']
    constant, count = struct.unpack_from('>II', sz, 4)
    sizes = [constant]*count if constant else list(struct.unpack_from(f'>{count}I', sz, 12))
    co = stbl[b'stco']
    chunks = struct.unpack_from(f'>{struct.unpack_from(">I", co, 4)[0]}I', co, 8)
    sc = stbl[b'stsc']
    entries = [struct.unpack_from('>III', sc, 8+i*12)
               for i in range(struct.unpack_from('>I', sc, 4)[0])]
    offsets = []
    sample = 0
    for chunk_index, offset in enumerate(chunks, 1):
        rule = next(e for e in reversed(entries) if e[0] <= chunk_index)
        for _ in range(rule[1]):
            offsets.append(offset)
            offset += sizes[sample]
            sample += 1
    assert len(offsets) == count == 16
    for i in range(3, 11):
        sizes[i] = 0
    replacements = {
        b'stsz': b'\0'*4+struct.pack('>II', 0, count)+struct.pack(f'>{count}I', *sizes),
        b'stco': b'\0'*4+struct.pack('>I', count)+struct.pack(f'>{count}I', *offsets),
        b'stsc': b'\0'*4+struct.pack('>IIII', 1, 1, 1, 1),
    }

    def rewrite(data):
        out = []
        for kind, payload in children(data):
            if kind in replacements:
                payload = replacements[kind]
            elif kind in (b'moov', b'trak', b'mdia', b'minf', b'stbl'):
                payload = rewrite(payload)
            out.append(box(kind, payload))
        return b''.join(out)
    assert [k for k, _ in children(raw)].index(b'mdat') < [k for k, _ in children(raw)].index(b'moov')
    path.write_bytes(rewrite(raw))


class EmptyCameraSamples(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.path = Path(self.tmp.name)/'카메라 빈 표본.mp4'
        with av.open(str(self.path), 'w') as output:
            stream = output.add_stream('mpeg4', rate=4)
            stream.width, stream.height, stream.pix_fmt = 160, 90, 'yuv420p'
            stream.codec_context.gop_size = 1
            stream.codec_context.max_b_frames = 0
            for i in range(16):
                frame = av.VideoFrame.from_ndarray(np.full((90,160,3), 40+i*10, np.uint8), format='rgb24')
                output.mux(stream.encode(frame))
            output.mux(stream.encode(None))
        insert_empty_samples(self.path)

    def tearDown(self):
        self.tmp.cleanup()

    def test_real_pts_after_empty_samples_and_backward_seek(self):
        reader = VideoReader(self.path, 'software')
        try:
            for requested, expected in [(0,0), (1,2.75), (1.5,2.75), (3,3), (.25,.25), (3.99,3.75), (3.999,3.75)]:
                _, actual, source = reader.read(requested)
                self.assertEqual(actual, expected)
                self.assertEqual(source, 'ffmpeg_frame_pts')
            self.assertGreater(reader.empty_packets, 0)
        finally:
            reader.close()

    def test_extraction_deduplicates_real_frames_without_filling_gap(self):
        roi = dict(ids_runs=[[960*200+100,40]], rect=[0,0,0,0], variants=[])
        config = dict(fps=2, white_enabled=False, relative_start=0, relative_end=1,
            cycle_plan=[dict(gas_on_s=1,gas_off_s=2,recovery_end_s=4)],
            first_injection_auto=False, baseline_window=1, decoder_mode='software',
            response_pixel_rule=dict(metric='V',k=3,delta_min=1), response_excluded_times=[])
        result = analyze_video(self.path, roi, config)
        self.assertEqual([r['time_s'] for r in result['rows']], [0,.5,2.75,3,3.5])
        self.assertFalse(result['cancelled'])

    def test_white_baseline_uses_unique_frames_inside_actual_time_window(self):
        reader = VideoReader(self.path, 'software')
        try:
            meta = reader.metadata()
        finally:
            reader.close()
        roi = dict(rect=[20,20,50,50])
        config = dict(fps=4, white_enabled=True, relative_start=0, relative_end=3,
            cycle_plan=[dict(gas_on_s=3)], first_injection_auto=False,
            decoder_mode='software')
        cal = prepare_baseline([self.path], [meta], roi, config, threading.Event())
        self.assertEqual(cal['samples'], 4)
        self.assertEqual(cal['actual_end_s'], 2.75)
        config.update(relative_start=.75, relative_end=2.6)
        cal = prepare_baseline([self.path], [meta], roi, config, threading.Event())
        self.assertEqual(cal['samples'], 0)
        self.assertIsNone(cal['white_baseline'])


if __name__ == '__main__':
    unittest.main()

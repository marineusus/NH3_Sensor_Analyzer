The application decodes the local original video with PyAV 19.0.2 and its
dynamically linked FFmpeg libraries. OpenCV remains responsible for INTER_LINEAR
resizing, image encoding, masks, and sponge detection. No external FFmpeg command
line installation is needed. The OpenCV VideoCapture FFmpeg plugin is not bundled
because the application no longer calls that separate decoder.

PyAV copyright/license: licenses/PyAV/LICENSE.txt in the packaged application.
Source and build instructions: https://github.com/PyAV-Org/PyAV/tree/v19.0.2
Windows wheel/build sources: https://github.com/PyAV-Org/pyav-wheels
The installed wheel reports its FFmpeg license as "LGPL version 3 or later".
FFmpeg license text is in FFmpeg-LGPL-3.0.txt.
FFmpeg source: https://git.ffmpeg.org/ffmpeg.git
FFmpeg library versions in this wheel:
libavutil 61.1.102, libavcodec 63.1.102, libavformat 63.1.102,
libavdevice 63.1.102, libavfilter 12.1.102,
libswscale 10.1.102, libswresample 7.1.102.

FFmpeg configuration reported by this wheel:
--disable-static --enable-shared --disable-programs --disable-doc
--disable-libxml2 --disable-lzma --disable-libtheora --disable-libfreetype
--disable-libfontconfig --disable-libbluray --disable-libopenjpeg
--enable-mediafoundation --enable-version3 --disable-alsa --disable-gnutls
--enable-libdav1d --enable-libmp3lame --enable-libopus --enable-libsvtav1
--enable-libvmaf --enable-libvpx --enable-libwebp --disable-libxcb --enable-zlib
--enable-libx265 --enable-libx264 --enable-nvenc --enable-nvdec --enable-amf
--enable-libvpl --disable-encoder=avui,dca,mlp,opus,s302m,sonic,sonic_ls,truehd
--disable-decoder=sonic --disable-libjack --disable-indev=jack
--disable-filter=gfxcapture

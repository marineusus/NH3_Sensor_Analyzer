"""Build OpenCV's original app modules on Windows x64, without source edits.

Use the project Python/NumPy. Install requirements-native-build.txt into a
separate tools folder; none of those tools are shipped in the application.
"""
import argparse
import hashlib
import json
import shutil
import subprocess
import sys
import tarfile
import urllib.request
from pathlib import Path
import numpy

SOURCE_URL = 'https://files.pythonhosted.org/packages/1d/99/76b7c80252aa83c1af16393454aafd125a0287101afe8deb0a6821af0e30/opencv_python_headless-5.0.0.93.tar.gz'
SOURCE_SHA256 = 'b82f9831daab90b725c7c1ee1b36cb5732c367096ac76d119e64e14eb70d5f3c'


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ('workspace','tools','output'):
        parser.add_argument('--'+name, type=Path, required=True)
    args = parser.parse_args()
    work, tools, output = [p.resolve() for p in (args.workspace,args.tools,args.output)]
    work.mkdir(parents=True, exist_ok=True)
    archive = work/'opencv_python_headless-5.0.0.93.tar.gz'
    if not archive.exists():
        urllib.request.urlretrieve(SOURCE_URL, archive)
    if hashlib.sha256(archive.read_bytes()).hexdigest() != SOURCE_SHA256:
        raise ValueError('OpenCV source checksum mismatch')
    source = work/'opencv_python_headless-5.0.0.93/opencv'
    if not source.exists():
        with tarfile.open(archive) as package:
            package.extractall(work, filter='data')
    zig = (tools/'ziglang/zig.exe').as_posix()
    cmake, ninja = tools/'cmake/data/bin/cmake.exe', tools/'bin/ninja.exe'
    for file in (Path(zig),cmake,ninja):
        if not file.is_file():
            raise ValueError(f'Missing build tool: {file}')
    for name in ('ar','ranlib'):
        (work/f'{name}.cmd').write_text(f'@"{zig}" {name} %*\n')
    toolchain = work/'toolchain.cmake'
    toolchain.write_text(f'''set(CMAKE_SYSTEM_NAME Windows)
set(CMAKE_SYSTEM_PROCESSOR AMD64)
set(CMAKE_C_COMPILER "{zig}")
set(CMAKE_C_COMPILER_ARG1 cc)
set(CMAKE_CXX_COMPILER "{zig}")
set(CMAKE_CXX_COMPILER_ARG1 c++)
set(CMAKE_C_FLAGS_INIT "-target x86_64-windows-gnu")
set(CMAKE_CXX_FLAGS_INIT "-target x86_64-windows-gnu")
set(CMAKE_RC_COMPILER "{zig}")
set(CMAKE_RC_COMPILE_OBJECT "<CMAKE_RC_COMPILER> rc /fo<OBJECT> <SOURCE>")
set(CMAKE_AR "{(work/'ar.cmd').as_posix()}")
set(CMAKE_RANLIB "{(work/'ranlib.cmd').as_posix()}")
set(CMAKE_CROSSCOMPILING OFF)
''', encoding='utf-8')
    base = Path(sys.base_prefix)
    options = dict(CMAKE_MAKE_PROGRAM=ninja.as_posix(),
        CMAKE_TOOLCHAIN_FILE=toolchain.as_posix(), CMAKE_BUILD_TYPE='Release',
        BUILD_LIST='core,imgproc,imgcodecs,python3', BUILD_SHARED_LIBS='OFF',
        BUILD_TESTS='OFF', BUILD_PERF_TESTS='OFF', BUILD_EXAMPLES='OFF',
        BUILD_opencv_apps='OFF', CPU_DISPATCH='', WITH_PNG='ON', WITH_JPEG='ON',
        PYTHON3_EXECUTABLE=Path(sys.executable).as_posix(),
        PYTHON3_INCLUDE_DIR=(base/'include').as_posix(),
        PYTHON3_LIBRARY=(base/'libs/python314.lib').as_posix(),
        PYTHON3_LIBRARIES=(base/'libs/python314.lib').as_posix(),
        PYTHON3_LIBRARY_DEBUG='', PYTHON3_DEBUG_LIBRARIES='',
        PYTHON3_NUMPY_INCLUDE_DIRS=Path(numpy.get_include()).as_posix(),
        PYTHON3_PACKAGES_PATH=(work/'install/cv2').as_posix(),
        OPENCV_SKIP_PYTHON_LOADER='ON', PYTHON3_LIMITED_API='OFF',
        CMAKE_INSTALL_PREFIX=(work/'install').as_posix())
    for name in ('IPP','OPENCL','FFMPEG','MSMF','DSHOW','OPENEXR','TIFF','WEBP',
                 'AVIF','JASPER','JPEGXL','OPENJPEG','LAPACK','QUIRC','PROTOBUF'):
        options['WITH_'+name] = 'OFF'
    command = [str(cmake),'-S',str(source),'-B',str(work/'build'),'-G','Ninja']
    command += [f'-D{k}={v}' for k,v in options.items()]
    for name,cmd in [('configure',command),('build',[str(cmake),'--build',
            str(work/'build'),'--parallel','3'])]:
        with (work/f'{name}.log').open('w',encoding='utf-8') as log:
            result = subprocess.run(cmd,stdout=log,stderr=subprocess.STDOUT)
        if result.returncode:
            raise RuntimeError(f'{name} failed; see {work/name}.log')
    binary = work/'build/lib/python3/cv2.cp314-win_amd64.pyd'
    output.mkdir(parents=True,exist_ok=True)
    shutil.copy2(binary,output/'cv2.pyd')
    manifest = dict(source_url=SOURCE_URL,source_sha256=SOURCE_SHA256,
        opencv_version='5.0.0',options=options,binary_bytes=binary.stat().st_size,
        binary_sha256=hashlib.sha256(binary.read_bytes()).hexdigest())
    (output/'build-info.json').write_text(json.dumps(manifest,indent=2),encoding='utf-8')
    print(f'Built {output / "cv2.pyd"}: {binary.stat().st_size:,} bytes')


if __name__ == '__main__':
    main()

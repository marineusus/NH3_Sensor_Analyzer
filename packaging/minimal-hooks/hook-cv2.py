"""Our optional cv2.pyd is a flat static extension, without wheel bootstrap.

PyInstaller collects the extension and its actual DLL imports normally. The
upstream wheel hook would incorrectly import/copy unrelated cv2 packages from
the development environment. NumPy is imported explicitly by analyzer.py.
"""

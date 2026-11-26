"""Compatibility entry point: python server.py; implementation lives in backend/."""
import sys
if __name__ == '__main__':
    import runpy
    runpy.run_module('backend.server', run_name='__main__', alter_sys=True)
else:
    from backend import server as _implementation
    sys.modules[__name__] = _implementation

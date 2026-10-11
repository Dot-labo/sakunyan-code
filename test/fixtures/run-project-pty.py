"""Run the real CLI in a local PTY; retain its output on failure."""
import os
import pathlib
import pty
import select
import subprocess
import sys
import time

master, slave = pty.openpty()
child = subprocess.Popen(sys.argv[1:], stdin=slave, stdout=slave, stderr=slave, env=os.environ)
os.close(slave)
output = bytearray()
deadline = time.monotonic() + 30
try:
    while time.monotonic() < deadline:
        if select.select([master], [], [], 0.1)[0]:
            try:
                output.extend(os.read(master, 65536))
            except OSError:
                break
        if child.poll() is not None:
            break
    if child.poll() is None:
        child.kill()
        child.wait()
        print("PTY fixture timed out", file=sys.stderr)
    pathlib.Path(os.environ["PROJECT_PROBE_OUTPUT"] + ".terminal").write_bytes(output)
    sys.exit(child.wait())
finally:
    os.close(master)
    if child.poll() is None:
        child.kill()
        child.wait()

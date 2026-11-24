"""Paths and defaults of the website build."""

# The aember dev container's workspace: `aember record` finds the running
# container that mounts it and runs aember there.
AEMBER_WORKSPACE = "/aember_ws/aember"

# How a scene is recorded inside that container ({timeout} per scene, {qmp}:
# the QMP socket the recorder grabs the screen through).
AEMBER_LAUNCH = "aember app launch --headless --timeout {timeout} --qmp {qmp}"

DEV_PORT = 5173
PREVIEW_PORT = 4173

# Generated output, removed by `aember clean`.
OUTPUTS = ("dist", "test-results", "playwright-report", "tsconfig.tsbuildinfo")

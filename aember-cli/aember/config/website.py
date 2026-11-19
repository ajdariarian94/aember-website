"""Paths and defaults of the website build."""

# The aember dev container's workspace: `aember record` finds the running
# container that mounts it and runs aember there.
AEMBER_WORKSPACE = "/aember_ws/aember"

# How a scene is recorded inside that container ({timeout} per scene).
AEMBER_LAUNCH = "aember app launch --headless --timeout {timeout}"

DEV_PORT = 5173
PREVIEW_PORT = 4173

# Generated output, removed by `aember clean`.
OUTPUTS = ("dist", "test-results", "playwright-report", "tsconfig.tsbuildinfo")

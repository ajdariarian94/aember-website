export function GettingStarted() {
  return (
    <section>
      <h1>Getting started</h1>
      <p className="lead">
        You need Linux (or WSL2) with Docker, and VS Code with the Dev Containers
        extension. Clone the repository, run the prerequisites script on the host,
        and open the folder in its dev container.
      </p>
      <pre>
        <code>{`git clone https://github.com/ajdariarian94/aember.git
cd aember && ./tools/scripts/prerequisites.sh
code .   # "Reopen in Container"`}</code>
      </pre>
      <h2>Build and boot</h2>
      <pre>
        <code>{`aember app build                            # first run downloads everything
aember app pack                             # initramfs + root file system image
aember app launch --headless --timeout 60   # boot in QEMU, console in the terminal`}</code>
      </pre>
      <p>
        Without a virtual machine at all, aember runs as PID 1 in a chroot on your
        kernel: <code>aember app launch --chroot</code>. For another architecture add{" "}
        <code>--architecture aarch64-poky-linux</code> to each command.
      </p>
      <h2>Raspberry Pi 4</h2>
      <pre>
        <code>{`aember app build --architecture aarch64-poky-linux
aember app pack --architecture aarch64-poky-linux
aember rpi image
aember rpi flash --device /dev/sdX`}</code>
      </pre>
      <h2>Your own service</h2>
      <pre>
        <code>{`# services/hello/CMakeLists.txt
find_package(aember-libs REQUIRED COMPONENTS utils)
aember_service(aember-hello MAIN src/main.cpp
               LIBRARIES aember-libs::utils::ipc aember-libs::utils::logging)`}</code>
      </pre>
      <p>
        List it in <code>/etc/aember/services.json</code> and it is built, packed
        and supervised. The repository's README and services/README.md have the
        details.
      </p>
    </section>
  );
}

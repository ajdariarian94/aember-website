export function Hardware() {
  return (
    <section>
      <h1>Supported hardware</h1>
      <table>
        <thead>
          <tr>
            <th>Target</th>
            <th>CPU</th>
            <th>Runs on</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td className="mono">x64-poky-linux</td>
            <td>x86-64</td>
            <td>
              QEMU, PCs from a USB stick (UEFI); or without a VM, in a chroot on your
              own kernel or the AppImage
            </td>
          </tr>
          <tr>
            <td className="mono">aarch64-poky-linux</td>
            <td>ARMv8, Cortex-A72</td>
            <td>QEMU virt, Raspberry Pi 4 (SD card image)</td>
          </tr>
          <tr>
            <td className="mono">arm-poky-linux</td>
            <td>ARMv7-A, hard-float, NEON</td>
            <td>QEMU virt (Cortex-A15); one build for Cortex-A7/A9/A15 boards</td>
          </tr>
        </tbody>
      </table>
      <h2>Raspberry Pi 4</h2>
      <p>
        <code>aember rpi image</code> writes an SD card image: the pinned Raspberry Pi
        firmware and the kernel on a FAT partition, the root file system on ext4.
        The serial console is on GPIO 14/15 at 115200 baud; press <kbd>d</kbd> there
        for a shell. The board's watchdog is used out of the box.
      </p>
      <h2>x86-64 PCs</h2>
      <p>
        <code>aember usb image</code> writes a USB stick image: systemd-boot and the
        kernel on an EFI system partition, the root file system on ext4. Boot it in
        UEFI mode with Secure Boot off. The kernel brings the UEFI framebuffer (the
        screen works on any graphics card), Intel and Realtek network chips, NVMe,
        USB keyboards and the Intel and AMD chipset watchdogs. It is tested in QEMU
        (UEFI firmware, USB stick, Intel NIC), not yet on real PCs: reports on GitHub
        are welcome.
      </p>
      <h2>Underneath</h2>
      <p>
        The Linux kernel (6.16), BusyBox, LXC and the cross compilers (GCC 15) are
        built with Yocto in the separate aember-resources repository and downloaded
        prebuilt; the kernels are trimmed to what appliances need.
      </p>
    </section>
  );
}

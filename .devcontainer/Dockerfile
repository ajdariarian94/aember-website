# aember-website dev container: Node 22 + Chromium for Playwright (the
# official Playwright image, Ubuntu 24.04), Python for the aember CLI and
# the recorder, Docker CLI to reach the aember dev container for recordings.
ARG BASE_IMAGE=mcr.microsoft.com/playwright:v1.49.1-noble@sha256:70e367e0cbf60340a5b5fd562f6247a34eb3196efab9f88a3dd56482d9fe09d2
FROM ${BASE_IMAGE}

ARG UID=1000
ARG GID=1000
ARG USERNAME=dev
ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y --no-install-recommends \
        git python3 python3-venv python3-pip locales gh \
        ca-certificates sudo vim bash-completion figlet lolcat acl docker.io ffmpeg \
    && rm -rf /var/lib/apt/lists/* \
    && locale-gen en_US.UTF-8 \
    && ln -s /usr/games/lolcat /usr/local/bin/lolcat

ENV LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 \
    VIRTUAL_ENV=/venv \
    PATH=/venv/bin:$PATH \
    # Playwright uses the browsers baked into the base image.
    PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

# Create user, or rename the image's existing UID (e.g. "ubuntu") to $USERNAME
RUN set -e; \
    existing="$(getent passwd ${UID} | cut -d: -f1 || true)"; \
    if [ -n "$existing" ] && [ "$existing" != "${USERNAME}" ]; then \
        groupmod -n "${USERNAME}" "$(id -gn "$existing")"; \
        usermod -l "${USERNAME}" -d "/home/${USERNAME}" -m "$existing"; \
    elif [ -z "$existing" ]; then \
        groupadd -f -g "${GID}" "${USERNAME}"; \
        useradd -m -s /bin/bash -u "${UID}" -g "${GID}" "${USERNAME}"; \
    fi; \
    echo "${USERNAME} ALL=(ALL) NOPASSWD:ALL" > /etc/sudoers.d/${USERNAME}; \
    chmod 0440 /etc/sudoers.d/${USERNAME}; \
    usermod -aG docker "${USERNAME}"

# Python venv for project tools + aember CLI
# The CLI is copied to the same path the workspace is mounted at, and installed
# editable. At runtime the mount covers this copy, so the venv uses your live source.
COPY requirements.txt /tmp/requirements.txt
COPY aember-cli /aember_ws/aember-website/aember-cli
RUN python3 -m venv /venv \
    && /venv/bin/pip install --no-cache-dir -r /tmp/requirements.txt \
    && /venv/bin/pip install --no-cache-dir -e /aember_ws/aember-website/aember-cli \
    && chown -R ${UID}:${GID} /venv /aember_ws \
    && rm /tmp/requirements.txt

USER ${USERNAME}
WORKDIR /home/${USERNAME}

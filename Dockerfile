# syntax=docker/dockerfile:1
# OpenBot Isolated Sandbox Runtime for DeepSeek Harness (DSH)
# Provides isolated environment for agent script execution, filesystem operations, and tooling

FROM node:20-alpine

# Install core development and scripting dependencies
RUN apk add --no-cache \
    bash \
    curl \
    git \
    ca-certificates \
    python3 \
    py3-pip

# Set default shell to bash for consistent execution
SHELL ["/bin/bash", "-c"]

# Create and establish sandbox workspace
RUN mkdir -p /sandbox/workspace && chmod -R 777 /sandbox/workspace
WORKDIR /sandbox/workspace

# Set environment variables for sandbox identification
ENV OPENBOT_WORKSPACE=/sandbox/workspace \
    NODE_ENV=production \
    PAGER=cat

# Expose API and VNC ports
EXPOSE 8080 8081

# Keep container running detached to receive agent exec commands
CMD ["tail", "-f", "/dev/null"]

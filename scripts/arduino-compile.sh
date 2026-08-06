#!/usr/bin/env bash
# Compile-check arduino/main/main.ino with arduino-cli (Uno R4 Minima +
# ESP32-S3 — the same two FQBNs CI compiles in .github/workflows/checks.yml).
#
# Requires arduino-cli on PATH. Install options:
#   winget install Arduino.Arduino-cli
#   choco install arduino-cli
#   https://arduino.github.io/arduino-cli/
#
# First run downloads both cores and the libraries; subsequent runs are fast.
# Override the targets with FQBN / ESP32_FQBN if needed.
set -euo pipefail
cd "$(dirname "$0")/.."

FQBN="${FQBN:-arduino:renesas_uno:minima}"
ESP32_FQBN="${ESP32_FQBN:-esp32:esp32:esp32s3}"

if ! command -v arduino-cli >/dev/null 2>&1; then
  echo "error: arduino-cli not found on PATH (see header comment for install options)" >&2
  exit 1
fi

arduino-cli core update-index
arduino-cli core install arduino:renesas_uno
arduino-cli core install esp32:esp32
arduino-cli lib install ArduinoJson
arduino-cli lib install "Adafruit PWM Servo Driver Library"
arduino-cli lib install WebSockets

arduino-cli compile --fqbn "$FQBN" arduino/main
arduino-cli compile --fqbn "$ESP32_FQBN" arduino/main

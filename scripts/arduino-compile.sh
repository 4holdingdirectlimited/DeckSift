#!/usr/bin/env bash
# Compile-check arduino/main/main.ino with arduino-cli (Uno R4 Minima).
#
# Requires arduino-cli on PATH. Install options:
#   winget install Arduino.Arduino-cli
#   choco install arduino-cli
#   https://arduino.github.io/arduino-cli/
#
# First run downloads the Uno R4 core and the two libraries; subsequent runs
# are fast. Sketches are checked with:
#   arduino-cli compile --fqbn arduino:renesas_uno:minima arduino/main
set -euo pipefail
cd "$(dirname "$0")/.."

FQBN="${FQBN:-arduino:renesas_uno:minima}"

if ! command -v arduino-cli >/dev/null 2>&1; then
  echo "error: arduino-cli not found on PATH (see header comment for install options)" >&2
  exit 1
fi

arduino-cli core update-index
arduino-cli core install arduino:renesas_uno
arduino-cli lib install ArduinoJson
arduino-cli lib install "Adafruit PWM Servo Driver Library"

arduino-cli compile --fqbn "$FQBN" arduino/main

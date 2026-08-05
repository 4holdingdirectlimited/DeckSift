// Board abstraction for the DeckSift sorter firmware.
//
// One sketch (`main.ino`) runs on multiple controllers — the Arduino IDE /
// PlatformIO picks the right compile-time path below based on the selected
// board, so the same source flashes to an Uno R4 Minima, an ESP32-S3 (the
// DeckSift primary), an RP2040/Pico, an STM32, or a classic Uno/Nano.
//
// Differences handled here:
//   - EEPROM persistence (real EEPROM vs flash emulation)
//   - I2C pins for the PCA9685
//   - interrupt-attach helper (digitalPinToInterrupt differs per core)
//   - IR/pin defaults (override with -D<MACRO>=n if your wiring differs)
//
// If you add a new board family, add its ARDUINO_ARCH_* branch here; the
// sketch itself needs no changes.
#pragma once

#include <EEPROM.h>
#include <Wire.h>

// ─── EEPROM init ─────────────────────────────────────────────────────────────
// AVR + Renesas (Uno R4) have hardware EEPROM: get/put work directly.
// ESP32 / RP2040 emulate EEPROM in flash and require begin(size) first.
#if defined(ARDUINO_ARCH_ESP32) || defined(ARDUINO_ARCH_RP2040)
  #define BOARD_EEPROM_BEGIN() EEPROM.begin(512)
#else
  #define BOARD_EEPROM_BEGIN() ((void)0)
#endif

// ─── I2C pins (PCA9685) ──────────────────────────────────────────────────────
// ESP32-S3 default Wire is GPIO 8 (SDA) / 9 (SCL) — explicit and overridable.
#if defined(ARDUINO_ARCH_ESP32)
  #ifndef I2C_SDA
    #define I2C_SDA 8
  #endif
  #ifndef I2C_SCL
    #define I2C_SCL 9
  #endif
  #define BOARD_I2C_BEGIN() Wire.begin(I2C_SDA, I2C_SCL)
#else
  #define BOARD_I2C_BEGIN() Wire.begin()
#endif

// ─── Interrupt attach ────────────────────────────────────────────────────────
// attachInterrupt is universal; only the pin-wrapping helper differs.
#if defined(ARDUINO_ARCH_STM32)
  #define BOARD_IR_ATTACH() attachInterrupt(IR_PIN_MODULE1, onModule1IR, CHANGE)
#else
  #define BOARD_IR_ATTACH() \
    attachInterrupt(digitalPinToInterrupt(IR_PIN_MODULE1), onModule1IR, CHANGE)
#endif

// ─── IR sensor pins (defaults) ───────────────────────────────────────────────
// Active-LOW: pin reads LOW when a card is present. All defaults are valid on
// Uno R4 (D2-D5), ESP32-S3 (GPIO 2-5) and RP2040. Override per machine.
#ifndef IR_PIN_MODULE1
  #define IR_PIN_MODULE1 2
#endif
#ifndef IR_PIN_MODULE2
  #define IR_PIN_MODULE2 3
#endif
#ifndef IR_PIN_MODULE3
  #define IR_PIN_MODULE3 4
#endif
#ifndef IR_PIN_HOPPER
  #define IR_PIN_HOPPER 5
#endif

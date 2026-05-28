"""
telemetry_profiles
==================
Machine-type telemetry profiles for the TRACE-MES simulator.

Each profile defines four telemetry channels (spindle_speed, feed_rate,
temperature, vibration) with:
    base  — nominal operating value
    min   — hard lower clamp
    max   — hard upper clamp
    noise — std-dev of Gaussian noise per step (random-walk)

Profiles are used by the MachineState random-walk engine to produce
realistic, type-specific telemetry data.
"""

PROFILES: dict[str, dict[str, dict[str, float]]] = {
    # ---- CNC (Milling / generic CNC) ----
    "CNC": {
        "spindle_speed": {"base": 10500, "min": 7000,   "max": 14000,  "noise": 180},
        "feed_rate":     {"base":   550, "min":  200,   "max":   900,  "noise":  28},
        "temperature":   {"base":    58, "min":   38,   "max":    78,  "noise":   0.9},
        "vibration":     {"base": 0.072, "min": 0.020,  "max":  0.160, "noise":   0.003},
    },
    # ---- Torna (CNC Turning / Lathe) ----
    "Turning": {
        "spindle_speed": {"base": 3200,  "min": 1200,   "max": 5500,   "noise": 120},
        "feed_rate":     {"base":   180, "min":   50,   "max":   400,  "noise":  12},
        "temperature":   {"base":    52, "min":   35,   "max":    72,  "noise":   0.7},
        "vibration":     {"base": 0.045, "min": 0.010,  "max":  0.120, "noise":   0.002},
    },
    # ---- Lazer Kesim (Laser Cutting) ----
    "Laser": {
        "spindle_speed": {"base": 4500,  "min": 2000,   "max": 8000,   "noise": 150},
        "feed_rate":     {"base":  1200, "min":  400,   "max":  2500,  "noise":  45},
        "temperature":   {"base":   320, "min":  180,   "max":   520,  "noise":   6.0},
        "vibration":     {"base": 0.015, "min": 0.003,  "max":  0.045, "noise":   0.001},
    },
    # ---- Hydraulic / Mechanical Press ----
    "Press": {
        "spindle_speed": {"base":   2.0, "min":   0.0,  "max":    8.0, "noise":   0.40},
        "feed_rate":     {"base":  28.0, "min":   8.0,  "max":   55.0, "noise":   2.00},
        "temperature":   {"base":  72.0, "min":  48.0,  "max":   92.0, "noise":   1.20},
        "vibration":     {"base":  1.55, "min":  0.50,  "max":   2.80, "noise":   0.080},
    },
    # ---- Welding (MIG/TIG/Arc) ----
    "Welding": {
        "spindle_speed": {"base":   4.0, "min":   0.0,  "max":   12.0, "noise":   0.50},
        "feed_rate":     {"base": 480.0, "min": 200.0,  "max":  750.0, "noise":  22.00},
        "temperature":   {"base": 520.0, "min": 180.0,  "max":  850.0, "noise":  28.00},
        "vibration":     {"base": 0.180, "min": 0.040,  "max":  0.400, "noise":   0.010},
    },
    # ---- Soldering (Reflow / Wave) ----
    "Soldering": {
        "spindle_speed": {"base":   0.5, "min":   0.0,  "max":    5.0, "noise":   0.15},
        "feed_rate":     {"base":  45.0, "min":  15.0,  "max":   90.0, "noise":   3.00},
        "temperature":   {"base": 262.0, "min": 235.0,  "max":  310.0, "noise":   2.00},
        "vibration":     {"base": 0.018, "min": 0.005,  "max":  0.040, "noise":   0.001},
    },
    # ---- Testing (ICT / Functional Test) ----
    "Testing": {
        "spindle_speed": {"base": 320.0, "min":   0.0,  "max":  580.0, "noise":  15.00},
        "feed_rate":     {"base":  22.0, "min":   0.0,  "max":   70.0, "noise":   3.00},
        "temperature":   {"base":  27.0, "min":  20.0,  "max":   38.0, "noise":   0.40},
        "vibration":     {"base": 0.018, "min": 0.004,  "max":  0.040, "noise":   0.001},
    },
    # ---- Injection Molding ----
    "Molding": {
        "spindle_speed": {"base": 140.0, "min":  40.0,  "max":  280.0, "noise":   8.00},
        "feed_rate":     {"base":  75.0, "min":  20.0,  "max":  140.0, "noise":   5.00},
        "temperature":   {"base": 225.0, "min": 175.0,  "max":  275.0, "noise":   2.50},
        "vibration":     {"base": 0.038, "min": 0.010,  "max":  0.090, "noise":   0.002},
    },
    # ---- Painting (Spray Booth) ----
    "Painting": {
        "spindle_speed": {"base": 1550,  "min":  900,   "max":  1900,  "noise":  30.00},
        "feed_rate":     {"base":  240,  "min":   90,   "max":   420,  "noise":  12.00},
        "temperature":   {"base":   26,  "min":   18,   "max":    38,  "noise":   0.50},
        "vibration":     {"base": 0.014, "min": 0.003,  "max":  0.035, "noise":   0.0008},
    },
    # ---- Assembly (Robot Arm / Manual Station) ----
    "Assembly": {
        "spindle_speed": {"base":  850,  "min":  200,   "max":  1400,  "noise":  40.00},
        "feed_rate":     {"base":   22,  "min":    5,   "max":    55,  "noise":   2.00},
        "temperature":   {"base":   36,  "min":   22,   "max":    52,  "noise":   0.50},
        "vibration":     {"base": 0.022, "min": 0.005,  "max":  0.055, "noise":   0.001},
    },
    # ---- Packaging ----
    "Packaging": {
        "spindle_speed": {"base":  520,  "min":  120,   "max":   780,  "noise":  20.00},
        "feed_rate":     {"base":  380,  "min":  150,   "max":   580,  "noise":  15.00},
        "temperature":   {"base":   24,  "min":   18,   "max":    32,  "noise":   0.30},
        "vibration":     {"base": 0.028, "min": 0.006,  "max":  0.065, "noise":   0.001},
    },
}

# Fallback profile when machine type doesn't match any known profile
DEFAULT_PROFILE = PROFILES["CNC"]


def get_profile(machine_type: str) -> dict:
    """Return the telemetry profile for a given machine type, falling back to CNC."""
    return PROFILES.get(machine_type, DEFAULT_PROFILE)


# Human-readable labels for GUI display
MACHINE_TYPE_CHOICES = [
    ("CNC",       "CNC (Freze)"),
    ("Turning",   "Torna"),
    ("Laser",     "Lazer Kesim"),
    ("Press",     "Pres"),
    ("Welding",   "Kaynak"),
    ("Soldering", "Lehim"),
    ("Testing",   "Test"),
    ("Molding",   "Enjeksiyon Kalıp"),
    ("Painting",  "Boya"),
    ("Assembly",  "Montaj"),
    ("Packaging", "Paketleme"),
]

"""
Astro Agent — AI-powered celestial body recognition and analysis engine.
Powered by Claude Opus 4.7 with tool use, prompt caching, and adaptive thinking.
"""

import json
import os
from typing import Optional
import anthropic

client = anthropic.Anthropic(api_key=os.environ.get("ANTHROPIC_API_KEY"))

# ─── Celestial Database ────────────────────────────────────────────────────────

CELESTIAL_DATABASE: dict = {
    "planets": {
        "mercury": {
            "type": "planet", "subtype": "terrestrial", "solar_system": True,
            "distance_from_sun_au": 0.39, "diameter_km": 4879, "mass_kg": 3.30e23,
            "gravity_m_s2": 3.7, "orbital_period_days": 88, "rotation_period_hours": 1407.6,
            "moons": 0, "rings": False, "surface_temp_range_c": [-180, 430],
            "atmosphere": "extremely thin (sodium, oxygen, hydrogen)",
            "discovery": "known since antiquity", "missions": ["Mariner 10", "MESSENGER", "BepiColombo (ongoing)"],
            "fun_facts": [
                "Smallest planet in the solar system",
                "Has the largest temperature swings of any planet",
                "A day on Mercury is longer than its year",
                "Has water ice in permanently shadowed craters near poles"
            ]
        },
        "venus": {
            "type": "planet", "subtype": "terrestrial", "solar_system": True,
            "distance_from_sun_au": 0.72, "diameter_km": 12104, "mass_kg": 4.87e24,
            "gravity_m_s2": 8.87, "orbital_period_days": 225, "rotation_period_hours": -5832,
            "moons": 0, "rings": False, "surface_temp_c": 465,
            "atmosphere": "thick CO2 with sulfuric acid clouds, 92 bar pressure",
            "discovery": "known since antiquity", "missions": ["Venera series", "Magellan", "DAVINCI+ (upcoming)", "EnVision (upcoming)"],
            "fun_facts": [
                "Hottest planet despite not being closest to the Sun (runaway greenhouse effect)",
                "Rotates backwards (retrograde) compared to most planets",
                "A Venusian day is longer than its year",
                "Surface pressure is equivalent to 900m underwater on Earth"
            ]
        },
        "earth": {
            "type": "planet", "subtype": "terrestrial", "solar_system": True,
            "distance_from_sun_au": 1.0, "diameter_km": 12756, "mass_kg": 5.97e24,
            "gravity_m_s2": 9.81, "orbital_period_days": 365.25, "rotation_period_hours": 23.93,
            "moons": 1, "rings": False, "surface_temp_range_c": [-89, 58],
            "atmosphere": "N2 (78%), O2 (21%), Ar (0.93%), CO2 (0.04%)",
            "discovery": "home", "missions": ["countless Earth observation satellites"],
            "fun_facts": [
                "Only known planet to harbor life",
                "71% of surface covered by water",
                "Has a powerful magnetic field protecting life from solar radiation",
                "Located in the Goldilocks zone — just right for liquid water"
            ]
        },
        "mars": {
            "type": "planet", "subtype": "terrestrial", "solar_system": True,
            "distance_from_sun_au": 1.52, "diameter_km": 6779, "mass_kg": 6.39e23,
            "gravity_m_s2": 3.72, "orbital_period_days": 687, "rotation_period_hours": 24.6,
            "moons": 2, "rings": False, "surface_temp_range_c": [-125, 20],
            "atmosphere": "thin CO2 (0.6% of Earth pressure)",
            "discovery": "known since antiquity",
            "missions": ["Viking 1 & 2", "Pathfinder", "Spirit", "Opportunity", "Curiosity (active)", "Perseverance (active)", "Ingenuity helicopter"],
            "fun_facts": [
                "Has Olympus Mons, the largest volcano in the solar system (21 km high)",
                "Has Valles Marineris, a canyon system as wide as the USA",
                "Evidence of liquid water in the ancient past",
                "Two small moons: Phobos and Deimos"
            ]
        },
        "jupiter": {
            "type": "planet", "subtype": "gas_giant", "solar_system": True,
            "distance_from_sun_au": 5.2, "diameter_km": 142984, "mass_kg": 1.90e27,
            "gravity_m_s2": 24.79, "orbital_period_days": 4333, "rotation_period_hours": 9.93,
            "moons": 95, "rings": True, "core_temp_c": 24000,
            "atmosphere": "H2 (89%), He (10%), methane, ammonia, water",
            "discovery": "known since antiquity",
            "missions": ["Pioneer 10 & 11", "Voyager 1 & 2", "Galileo", "Cassini flyby", "Juno (active)", "Europa Clipper (en route)"],
            "fun_facts": [
                "Great Red Spot is a storm larger than Earth, raging for 350+ years",
                "More than 2x more massive than all other planets combined",
                "Has 95 known moons including Europa (possible life candidate)",
                "Acts as a 'cosmic vacuum cleaner' protecting inner planets"
            ]
        },
        "saturn": {
            "type": "planet", "subtype": "gas_giant", "solar_system": True,
            "distance_from_sun_au": 9.58, "diameter_km": 120536, "mass_kg": 5.68e26,
            "gravity_m_s2": 10.44, "orbital_period_days": 10759, "rotation_period_hours": 10.7,
            "moons": 146, "rings": True, "ring_span_km": 282000,
            "atmosphere": "H2 (96%), He (3%)",
            "discovery": "known since antiquity",
            "missions": ["Pioneer 11", "Voyager 1 & 2", "Cassini-Huygens"],
            "fun_facts": [
                "Least dense planet — would float in water",
                "Rings are made of ice and rock, up to 1 km thick but extending 282,000 km",
                "Has 146 known moons — most of any planet",
                "Titan (moon) has liquid methane lakes and a thick atmosphere"
            ]
        },
        "uranus": {
            "type": "planet", "subtype": "ice_giant", "solar_system": True,
            "distance_from_sun_au": 19.2, "diameter_km": 51118, "mass_kg": 8.68e25,
            "gravity_m_s2": 8.69, "orbital_period_days": 30589, "rotation_period_hours": -17.24,
            "moons": 28, "rings": True,
            "atmosphere": "H2, He, methane (gives blue-green color)",
            "discovery": "1781 by William Herschel",
            "missions": ["Voyager 2 (1986 flyby)"],
            "fun_facts": [
                "Tilted 98° on its side — rolls around the Sun like a bowling ball",
                "Coldest planetary atmosphere in the solar system (-224°C)",
                "Has 13 known rings",
                "Moons named after Shakespeare and Alexander Pope characters"
            ]
        },
        "neptune": {
            "type": "planet", "subtype": "ice_giant", "solar_system": True,
            "distance_from_sun_au": 30.1, "diameter_km": 49528, "mass_kg": 1.02e26,
            "gravity_m_s2": 11.15, "orbital_period_days": 59800, "rotation_period_hours": 16.11,
            "moons": 16, "rings": True, "wind_speed_km_h": 2100,
            "atmosphere": "H2, He, methane",
            "discovery": "1846 (predicted mathematically by Adams and Le Verrier)",
            "missions": ["Voyager 2 (1989 flyby)"],
            "fun_facts": [
                "Strongest winds in the solar system (2100 km/h)",
                "Was the first planet found through mathematical prediction",
                "Great Dark Spot: a storm the size of Earth (now gone)",
                "Triton orbits backwards and will eventually be torn apart to form rings"
            ]
        },
        "proxima centauri b": {
            "type": "planet", "subtype": "exoplanet_terrestrial", "solar_system": False,
            "host_star": "Proxima Centauri", "distance_from_earth_ly": 4.24,
            "orbital_period_days": 11.2, "mass_earth": 1.17, "potentially_habitable": True,
            "discovery": "2016", "discovery_method": "radial velocity",
            "fun_facts": [
                "Closest known exoplanet to Earth",
                "In the habitable zone of Proxima Centauri",
                "Likely tidally locked — one face always toward star",
                "Subject of Breakthrough Starshot interstellar mission proposal"
            ]
        },
        "kepler-452b": {
            "type": "planet", "subtype": "exoplanet_super_earth", "solar_system": False,
            "host_star": "Kepler-452", "distance_from_earth_ly": 1400,
            "orbital_period_days": 385, "diameter_earth": 1.63, "mass_earth": 5.0,
            "potentially_habitable": True, "discovery": "2015", "discovery_method": "transit",
            "fun_facts": [
                "Called 'Earth's cousin' — similar orbit period around sun-like star",
                "1,400 light-years away in the constellation Cygnus",
                "60% larger than Earth",
                "Its star is 6 billion years old vs Earth's 4.5 billion"
            ]
        },
    },
    "stars": {
        "sun": {
            "type": "star", "spectral_class": "G2V", "solar_system": True,
            "diameter_km": 1392700, "mass_kg": 1.989e30, "age_billion_years": 4.6,
            "surface_temp_k": 5778, "core_temp_k": 15_000_000, "luminosity_solar": 1.0,
            "distance_from_earth_au": 0, "distance_from_galactic_center_ly": 26000,
            "stage": "main sequence", "estimated_remaining_life_billion_years": 5.0,
            "fun_facts": [
                "Contains 99.86% of the solar system's total mass",
                "Light takes 8 minutes 20 seconds to reach Earth",
                "Will expand into a red giant in ~5 billion years",
                "Completes one galactic orbit every 225–250 million years (cosmic year)"
            ]
        },
        "sirius": {
            "type": "star", "spectral_class": "A1V", "binary": True,
            "companion": "Sirius B (white dwarf)", "distance_from_earth_ly": 8.6,
            "diameter_solar": 1.711, "mass_solar": 2.063, "surface_temp_k": 9940,
            "luminosity_solar": 25.4, "constellation": "Canis Major",
            "apparent_magnitude": -1.46, "absolute_magnitude": 1.43,
            "fun_facts": [
                "Brightest star in the night sky",
                "Part of a binary system with a white dwarf companion",
                "Ancient Egyptians used its heliacal rising to predict Nile floods",
                "Also called the Dog Star"
            ]
        },
        "betelgeuse": {
            "type": "star", "spectral_class": "M1-2 Ia-ab", "subtype": "red supergiant",
            "distance_from_earth_ly": 700, "diameter_solar": 764, "mass_solar": "16.5-19",
            "surface_temp_k": 3500, "luminosity_solar": 100000,
            "constellation": "Orion", "apparent_magnitude": 0.5,
            "supernova_risk": "imminent (astronomically speaking)",
            "fun_facts": [
                "So large it would extend past Jupiter's orbit if placed at our Sun's location",
                "Experienced dramatic 'Great Dimming' in 2019–2020",
                "Will explode as a supernova within the next 100,000 years",
                "Visible to naked eye, 9th brightest star"
            ]
        },
        "proxima centauri": {
            "type": "star", "spectral_class": "M5.5Ve", "subtype": "red dwarf",
            "distance_from_earth_ly": 4.24, "diameter_solar": 0.154, "mass_solar": 0.1221,
            "surface_temp_k": 3042, "luminosity_solar": 0.0017,
            "constellation": "Centaurus", "age_billion_years": 4.85,
            "fun_facts": [
                "Closest star to the Sun",
                "Part of the Alpha Centauri triple star system",
                "Hosts Proxima Centauri b, a potentially habitable exoplanet",
                "Emits powerful flares that may render its planet uninhabitable"
            ]
        },
        "vega": {
            "type": "star", "spectral_class": "A0Va", "distance_from_earth_ly": 25,
            "diameter_solar": 2.36, "mass_solar": 2.135, "surface_temp_k": 9602,
            "luminosity_solar": 40.12, "constellation": "Lyra",
            "apparent_magnitude": 0.03, "rotation_period_hours": 17,
            "fun_facts": [
                "Second brightest star in the northern hemisphere",
                "Spins so fast it's 20% wider at equator than poles",
                "Was the North Star 14,000 years ago and will be again in 12,000 years",
                "Featured in Carl Sagan's 'Contact'"
            ]
        },
        "polaris": {
            "type": "star", "spectral_class": "F7Ib", "subtype": "yellow supergiant",
            "distance_from_earth_ly": 433, "mass_solar": 5.4, "surface_temp_k": 6015,
            "luminosity_solar": 2500, "constellation": "Ursa Minor",
            "common_name": "North Star / Pole Star",
            "fun_facts": [
                "Currently within 0.7° of the celestial north pole",
                "A triple star system (Polaris A, Ab, B)",
                "Has been used for navigation for millennia",
                "Will be replaced as North Star by Gamma Cephei in 3000 CE"
            ]
        },
        "rigel": {
            "type": "star", "spectral_class": "B8Ia", "subtype": "blue supergiant",
            "distance_from_earth_ly": 863, "diameter_solar": 78.9, "mass_solar": 21,
            "surface_temp_k": 12100, "luminosity_solar": 120000,
            "constellation": "Orion", "apparent_magnitude": 0.13,
            "fun_facts": [
                "Brightest star in Orion despite being named 'Beta Orionis'",
                "Absolute luminosity 120,000× the Sun",
                "Will end as a spectacular supernova",
                "Named from Arabic 'Rijl Jauzah al-Yusrā' meaning 'the left leg of the Great One'"
            ]
        },
        "antares": {
            "type": "star", "spectral_class": "M1.5Iab-Ib", "subtype": "red supergiant",
            "distance_from_earth_ly": 550, "diameter_solar": 700, "mass_solar": 12,
            "surface_temp_k": 3400, "luminosity_solar": 57500,
            "constellation": "Scorpius", "apparent_magnitude": 1.06,
            "fun_facts": [
                "Name means 'rival of Ares (Mars)' due to its reddish color",
                "Diameter would reach beyond Mars if placed at the Sun",
                "One of the largest stars visible to the naked eye",
                "Will explode as a supernova in the next million years"
            ]
        },
    },
    "moons": {
        "moon": {
            "type": "moon", "parent_body": "earth", "diameter_km": 3474, "mass_kg": 7.34e22,
            "distance_from_parent_km": 384400, "orbital_period_days": 27.3,
            "surface_temp_range_c": [-173, 127], "gravity_m_s2": 1.62,
            "atmosphere": "extremely tenuous (exosphere)",
            "missions": ["Apollo 11-17", "Luna series", "Lunar Reconnaissance Orbiter", "LCROSS", "Chandrayaan series", "Artemis program (ongoing)"],
            "fun_facts": [
                "Only extraterrestrial body humans have set foot on (1969–1972)",
                "Stabilizes Earth's axial tilt, making our climate possible",
                "Slowly receding from Earth at 3.8 cm/year",
                "Formed from debris after a Mars-sized body (Theia) hit Earth"
            ]
        },
        "europa": {
            "type": "moon", "parent_body": "jupiter", "diameter_km": 3121, "mass_kg": 4.80e22,
            "distance_from_parent_km": 671100, "orbital_period_days": 3.55,
            "surface_temp_c": -160, "subsurface_ocean": True, "ocean_depth_km": 100,
            "missions": ["Voyager 1 & 2", "Galileo", "Europa Clipper (en route 2024)"],
            "habitability": "high priority candidate for extraterrestrial life",
            "fun_facts": [
                "Has a global subsurface liquid water ocean beneath ~10-30 km of ice",
                "Ocean may contain twice as much water as all Earth's oceans",
                "Hydrothermal vents on the ocean floor could support life",
                "Tidal flexing from Jupiter provides heat to keep ocean liquid"
            ]
        },
        "titan": {
            "type": "moon", "parent_body": "saturn", "diameter_km": 5150, "mass_kg": 1.35e23,
            "distance_from_parent_km": 1221870, "orbital_period_days": 15.95,
            "surface_temp_c": -179, "atmosphere": "thick N2, methane (1.45 bar pressure)",
            "missions": ["Cassini-Huygens (Huygens landed 2005)", "Dragonfly (launching 2027)"],
            "fun_facts": [
                "Only moon with a dense atmosphere and hydrocarbon lakes and rivers",
                "Lakes of liquid methane and ethane instead of water",
                "Larger than the planet Mercury",
                "Dragonfly mission will send a rotorcraft to explore its surface"
            ]
        },
        "io": {
            "type": "moon", "parent_body": "jupiter", "diameter_km": 3642, "mass_kg": 8.93e22,
            "distance_from_parent_km": 421700, "orbital_period_days": 1.77,
            "volcanism": "most volcanically active body in the solar system",
            "missions": ["Voyager 1 & 2", "Galileo", "Juno flybys"],
            "fun_facts": [
                "Has over 400 active volcanoes",
                "Volcanic plumes can reach 500 km high",
                "Surface continuously reshaped by lava flows — no impact craters",
                "Tidal squeezing by Jupiter and other Galilean moons generates the heat"
            ]
        },
        "ganymede": {
            "type": "moon", "parent_body": "jupiter", "diameter_km": 5268, "mass_kg": 1.48e23,
            "distance_from_parent_km": 1070400, "orbital_period_days": 7.15,
            "magnetic_field": True, "subsurface_ocean": True,
            "missions": ["Voyager 1 & 2", "Galileo", "JUICE (en route)"],
            "fun_facts": [
                "Largest moon in the solar system — bigger than Mercury",
                "Only moon known to have its own magnetic field",
                "Has a saltwater ocean beneath its icy crust",
                "ESA's JUICE spacecraft will orbit Ganymede from 2034"
            ]
        },
        "enceladus": {
            "type": "moon", "parent_body": "saturn", "diameter_km": 504, "mass_kg": 1.08e20,
            "distance_from_parent_km": 238020, "orbital_period_days": 1.37,
            "subsurface_ocean": True, "geysers": True,
            "missions": ["Voyager 2", "Cassini"],
            "fun_facts": [
                "Shoots geysers of water ice and organic compounds from its south pole",
                "Cassini flew through plumes and detected hydrogen, organic molecules",
                "Global subsurface ocean with hydrothermal activity",
                "Top candidate for life in the solar system after Europa"
            ]
        },
        "triton": {
            "type": "moon", "parent_body": "neptune", "diameter_km": 2707, "mass_kg": 2.14e22,
            "distance_from_parent_km": 354759, "orbital_period_days": -5.877,
            "retrograde_orbit": True, "surface_temp_c": -235,
            "missions": ["Voyager 2 (1989)"],
            "fun_facts": [
                "Only large moon that orbits in the opposite direction to its planet",
                "Likely a captured Kuiper Belt Object",
                "Coldest measured surface in the solar system",
                "Will be torn apart by Neptune's gravity in ~3.6 billion years"
            ]
        },
    },
    "asteroids": {
        "ceres": {
            "type": "asteroid", "subtype": "dwarf_planet", "location": "asteroid belt",
            "diameter_km": 940, "mass_kg": 9.39e20, "orbital_period_years": 4.6,
            "distance_from_sun_au": 2.77, "surface_temp_c": -105,
            "missions": ["Dawn (2015–2018)"],
            "fun_facts": [
                "Largest object in the asteroid belt",
                "Classified as both an asteroid and a dwarf planet",
                "Has water ice just below its surface",
                "Bright spots in Occator Crater are salt deposits from ancient brine"
            ]
        },
        "vesta": {
            "type": "asteroid", "subtype": "protoplanet", "location": "asteroid belt",
            "diameter_km": 525, "mass_kg": 2.59e20, "orbital_period_years": 3.63,
            "distance_from_sun_au": 2.36,
            "missions": ["Dawn (2011–2012)"],
            "fun_facts": [
                "Second largest asteroid in the belt",
                "Has a differentiated core like a planet",
                "Giant impact crater (Rheasilvia) spans 90% of Vesta's diameter",
                "Some meteorites found on Earth came from Vesta"
            ]
        },
        "apophis": {
            "type": "asteroid", "subtype": "near_earth", "diameter_m": 370,
            "mass_kg": 2.7e10, "close_approach_year": 2029,
            "close_approach_distance_km": 31000,
            "fun_facts": [
                "Will pass closer to Earth than our geostationary satellites in 2029",
                "Once had a 2.7% chance of impacting Earth in 2068 (now ruled out)",
                "Named after the Egyptian god of chaos",
                "ESA's RAMSES and NASA will study it during 2029 flyby"
            ]
        },
        "bennu": {
            "type": "asteroid", "subtype": "near_earth_carbonaceous", "diameter_m": 490,
            "mass_kg": 7.33e10, "orbital_period_years": 1.2,
            "missions": ["OSIRIS-REx (sample return 2023)"],
            "fun_facts": [
                "OSIRIS-REx collected 121 grams of sample — largest from an asteroid",
                "Contains amino acids and organic molecules from early solar system",
                "Small chance (~0.037%) of Earth impact in 2182",
                "Covered in loose rubble — spacecraft nearly sank in when it landed"
            ]
        },
        "ryugu": {
            "type": "asteroid", "subtype": "near_earth_carbonaceous", "diameter_m": 900,
            "missions": ["Hayabusa2 (sample return 2020)"],
            "fun_facts": [
                "Japan's Hayabusa2 returned the first sub-surface asteroid sample",
                "Samples contained over 20 amino acids and organic compounds",
                "Diamond-shaped with a prominent equatorial ridge",
                "One of the most carbon-rich objects ever studied"
            ]
        },
        "psyche": {
            "type": "asteroid", "subtype": "metallic", "diameter_km": 226,
            "mass_kg": 2.41e19, "location": "asteroid belt",
            "missions": ["Psyche (NASA, launched 2023, arrives 2029)"],
            "fun_facts": [
                "May be the exposed metallic core of a destroyed protoplanet",
                "Contains iron and nickel worth estimated $10 quintillion",
                "NASA launched dedicated mission to study it",
                "Could reveal how planetary cores form"
            ]
        },
    },
    "comets": {
        "halley's comet": {
            "type": "comet", "subtype": "short_period", "period_years": 75,
            "nucleus_km": [15, 8], "last_perihelion": 1986, "next_perihelion": 2061,
            "missions": ["Giotto (ESA)", "Vega 1 & 2 (USSR)", "Suisei & Sakigake (Japan)"],
            "fun_facts": [
                "Most famous comet, visible every 75 years",
                "Observed and recorded since 240 BC",
                "Halley himself was the first to realize it returned periodically",
                "Depicted in the Bayeux Tapestry during 1066 appearance"
            ]
        },
        "comet hale-bopp": {
            "type": "comet", "subtype": "long_period", "period_years": 2520,
            "nucleus_km": 60, "perihelion_year": 1997,
            "fun_facts": [
                "Largest comet nucleus ever observed (~60 km)",
                "Visible to naked eye for a record 18 months",
                "Two distinct ion and dust tails clearly visible",
                "Next perihelion expected around 4385 CE"
            ]
        },
        "67p/churyumov-gerasimenko": {
            "type": "comet", "subtype": "jupiter_family", "period_years": 6.44,
            "nucleus_km": [4.3, 2.6], "perihelion": 1.24,
            "missions": ["Rosetta (ESA) — first comet orbiter + Philae lander 2014"],
            "fun_facts": [
                "First comet to be orbited AND landed on by a spacecraft",
                "Rosetta detected organic molecules, molecular oxygen, glycine (amino acid)",
                "Has a rubber duck shape from two lobes merging",
                "Surface temperature varies 200°C between day and night"
            ]
        },
        "neowise": {
            "type": "comet", "subtype": "long_period", "period_years": 6800,
            "discovery_year": 2020, "perihelion_year": 2020,
            "fun_facts": [
                "Brightest comet visible from Northern Hemisphere since Hale-Bopp (1997)",
                "Discovered by NASA's NEOWISE space telescope",
                "Displayed two tails: ion (blue) and dust (white/yellow)",
                "Will not return for approximately 6,800 years"
            ]
        },
        "shoemaker-levy 9": {
            "type": "comet", "subtype": "disrupted", "discovery_year": 1993,
            "impact_year": 1994, "impact_body": "jupiter",
            "fun_facts": [
                "First direct observation of a collision between solar system bodies",
                "Jupiter's tidal forces broke it into 21 fragments before impact",
                "Impact scars on Jupiter larger than Earth, visible for months",
                "Changed how we understand Jupiter as a comet/asteroid shield"
            ]
        },
    },
    "nebulae": {
        "orion nebula": {
            "type": "nebula", "subtype": "emission_reflection", "constellation": "Orion",
            "distance_from_earth_ly": 1344, "diameter_ly": 24,
            "mass_solar": 2000, "contains_stars": True, "star_count": "~2000",
            "fun_facts": [
                "Brightest nebula visible to naked eye (magnitude 4.0)",
                "Active stellar nursery — star formation happening right now",
                "Contains the Trapezium Cluster: four massive young hot stars",
                "One of the most photographed objects in the sky"
            ]
        },
        "crab nebula": {
            "type": "nebula", "subtype": "supernova_remnant", "constellation": "Taurus",
            "distance_from_earth_ly": 6500, "diameter_ly": 11,
            "origin_supernova_year": 1054, "contains_pulsar": True,
            "pulsar_rotation_hz": 30,
            "fun_facts": [
                "Remnant of a supernova observed by Chinese astronomers in 1054",
                "Contains a neutron star (pulsar) spinning 30 times per second",
                "Expanding at 1500 km/s",
                "Was the first X-ray source identified outside the solar system"
            ]
        },
        "eagle nebula": {
            "type": "nebula", "subtype": "emission", "constellation": "Serpens",
            "distance_from_earth_ly": 7000, "diameter_ly": 70,
            "contains": ["Pillars of Creation", "active star formation"],
            "fun_facts": [
                "Home to the famous 'Pillars of Creation' (Hubble 1995)",
                "Pillars are giant columns of gas and dust forming new stars",
                "JWST revealed hidden stars inside the pillars in 2022",
                "Also called M16 or NGC 6611"
            ]
        },
        "helix nebula": {
            "type": "nebula", "subtype": "planetary", "constellation": "Aquarius",
            "distance_from_earth_ly": 655, "diameter_ly": 2.87,
            "contains_white_dwarf": True,
            "fun_facts": [
                "Closest planetary nebula to Earth",
                "Called the 'Eye of God' — looks like a giant eye in space",
                "Formed from a Sun-like star that shed its outer layers",
                "Central white dwarf is one of the closest known"
            ]
        },
        "carina nebula": {
            "type": "nebula", "subtype": "emission", "constellation": "Carina",
            "distance_from_earth_ly": 7500, "diameter_ly": 300,
            "mass_solar": "millions",
            "contains": ["Eta Carinae (hypernova candidate)", "multiple star clusters"],
            "fun_facts": [
                "One of the largest nebulae known — 300 light-years across",
                "Contains Eta Carinae, one of the most massive and luminous stars known",
                "First JWST image released to public on July 12, 2022",
                "Home to thousands of massive stars"
            ]
        },
        "pillars of creation": {
            "type": "nebula", "subtype": "dark_nebula_columns", "parent": "eagle nebula",
            "constellation": "Serpens", "distance_from_earth_ly": 6500,
            "height_ly": 4,
            "fun_facts": [
                "Iconic Hubble Space Telescope image from 1995",
                "Gas and dust columns where new stars are being born",
                "JWST imaged them in infrared, revealing stars forming inside",
                "May already be destroyed by a supernova shock wave en route to us"
            ]
        },
        "ring nebula": {
            "type": "nebula", "subtype": "planetary", "constellation": "Lyra",
            "distance_from_earth_ly": 2300, "diameter_ly": 1,
            "contains_white_dwarf": True,
            "fun_facts": [
                "Classic example of a planetary nebula",
                "Glowing ring of ionized gas ejected by a dying star",
                "Central white dwarf is one of the hottest known (~120,000 K)",
                "JWST revealed it's actually a cylinder, not a ring"
            ]
        },
    },
    "black_holes": {
        "sagittarius a*": {
            "type": "black_hole", "subtype": "supermassive", "location": "milky way galactic center",
            "mass_solar": 4_000_000, "schwarzschild_radius_km": 12_000_000,
            "distance_from_earth_ly": 26000,
            "first_image_year": 2022,
            "fun_facts": [
                "Supermassive black hole at the center of our Milky Way",
                "First imaged by the Event Horizon Telescope in 2022",
                "Stars orbit it at speeds up to 30 million km/h",
                "S2 star completes orbit in just 16 years, confirming the black hole's mass"
            ]
        },
        "m87*": {
            "type": "black_hole", "subtype": "supermassive", "location": "galaxy M87",
            "mass_solar": 6_500_000_000, "distance_from_earth_mly": 55,
            "jet_length_ly": 5000, "first_image_year": 2019,
            "fun_facts": [
                "First black hole ever imaged (2019, Event Horizon Telescope)",
                "6.5 billion times more massive than the Sun",
                "Shoots a relativistic jet 5,000 light-years long",
                "The image showed the photon ring (the 'shadow') for the first time"
            ]
        },
        "cygnus x-1": {
            "type": "black_hole", "subtype": "stellar", "location": "cygnus constellation",
            "mass_solar": 21.2, "distance_from_earth_ly": 6070,
            "companion_star": "HDE 226868 (blue supergiant)",
            "discovery_year": 1964, "confirmed_black_hole_year": 1972,
            "fun_facts": [
                "First black hole candidate ever identified",
                "Detected via X-ray emission as it consumes companion star material",
                "Stephen Hawking bet against it being a black hole (he lost)",
                "Part of a binary system with a blue supergiant companion"
            ]
        },
        "gw150914": {
            "type": "black_hole", "subtype": "binary_merger",
            "distance_from_earth_mly": 1300,
            "mass_primary_solar": 36, "mass_secondary_solar": 29, "mass_final_solar": 62,
            "energy_radiated_solar": 3,
            "detection_year": 2015, "detector": "LIGO",
            "fun_facts": [
                "First gravitational wave ever detected (September 14, 2015)",
                "Merger of two black holes created ripples in spacetime detected on Earth",
                "Equivalent to 3 solar masses converted to pure gravitational wave energy",
                "Led to the 2017 Nobel Prize in Physics for LIGO founders"
            ]
        },
        "ton 618": {
            "type": "black_hole", "subtype": "ultramassive_quasar",
            "mass_solar": 66_000_000_000, "distance_from_earth_mly": 10400,
            "luminosity_solar": 140_000_000_000_000,
            "fun_facts": [
                "One of the most massive black holes known: 66 billion solar masses",
                "Powers a quasar 140 trillion times brighter than the Sun",
                "Its event horizon would extend 1.3× beyond Pluto's orbit from the Sun",
                "Located 10.4 billion light-years away — we see it as it was long ago"
            ]
        },
    },
    "galaxies": {
        "milky way": {
            "type": "galaxy", "subtype": "barred_spiral",
            "diameter_ly": 100000, "thickness_ly": 1000,
            "star_count": "200-400 billion", "age_billion_years": 13.6,
            "central_black_hole": "Sagittarius A*",
            "fun_facts": [
                "Our home galaxy — Earth is 26,000 light-years from the center",
                "Contains 200–400 billion stars",
                "Has at least one star per star: 100–400 billion planets estimated",
                "Will collide with Andromeda in ~4.5 billion years"
            ]
        },
        "andromeda": {
            "type": "galaxy", "subtype": "spiral", "distance_from_earth_mly": 2.537,
            "diameter_ly": 220000, "star_count": "~1 trillion",
            "fun_facts": [
                "Largest galaxy in the Local Group",
                "Approaching the Milky Way at 110 km/s",
                "Will merge with the Milky Way in ~4.5 billion years",
                "Farthest object visible to naked eye (M31)"
            ]
        },
    }
}


def _search_database(query: str) -> tuple:
    query_lower = query.lower().strip()
    for category, objects in CELESTIAL_DATABASE.items():
        for name, data in objects.items():
            if query_lower == name or query_lower in name or name in query_lower:
                return name, data
    return None, None


# ─── Tool Implementations ──────────────────────────────────────────────────────

def classify_celestial_body(query: str) -> dict:
    name, data = _search_database(query)
    if data:
        return {
            "found_in_database": True,
            "matched_name": name,
            "object_type": data.get("type"),
            "object_subtype": data.get("subtype"),
            "confidence": "high",
        }
    return {
        "found_in_database": False,
        "query": query,
        "confidence": "unknown — use Claude knowledge",
    }


def get_celestial_info(name: str, object_type: Optional[str] = None) -> dict:
    matched_name, data = _search_database(name)
    if data:
        return {"source": "database", "name": matched_name, **data}
    return {
        "source": "not_in_database",
        "name": name,
        "object_type": object_type,
        "instruction": "Use your own extensive astronomical knowledge to provide accurate, detailed information about this celestial body.",
    }


def search_by_property(property_name: str, value_hint: str, object_type: Optional[str] = None) -> dict:
    results = []
    for category, objects in CELESTIAL_DATABASE.items():
        if object_type and category.rstrip("s") != object_type.rstrip("s"):
            continue
        for name, data in objects.items():
            str_data = json.dumps(data).lower()
            if value_hint.lower() in str_data:
                results.append({"name": name, "type": data.get("type"), "category": category})
    return {"results": results, "count": len(results)}


def compare_celestial_bodies(body1: str, body2: str) -> dict:
    _, data1 = _search_database(body1)
    _, data2 = _search_database(body2)
    return {
        "body1": {"name": body1, "data": data1 or "use Claude knowledge"},
        "body2": {"name": body2, "data": data2 or "use Claude knowledge"},
        "instruction": "Provide a rich comparative analysis highlighting similarities, differences, and interesting contrasts.",
    }


def list_object_types(object_type: str) -> dict:
    type_map = {
        "planet": "planets", "star": "stars", "moon": "moons",
        "asteroid": "asteroids", "comet": "comets", "nebula": "nebulae",
        "black_hole": "black_holes", "galaxy": "galaxies",
        "planets": "planets", "stars": "stars", "moons": "moons",
        "asteroids": "asteroids", "comets": "comets", "nebulae": "nebulae",
        "black_holes": "black_holes", "galaxies": "galaxies",
    }
    category = type_map.get(object_type.lower().replace(" ", "_"))
    if not category or category not in CELESTIAL_DATABASE:
        return {"error": f"Unknown type: {object_type}", "available_types": list(type_map.keys())}
    return {
        "type": category,
        "objects": list(CELESTIAL_DATABASE[category].keys()),
        "count": len(CELESTIAL_DATABASE[category]),
    }


# ─── Tool Definitions ─────────────────────────────────────────────────────────

TOOLS = [
    {
        "name": "classify_celestial_body",
        "description": "Identify what type of celestial body the user is asking about (planet, star, moon, asteroid, comet, nebula, black hole, galaxy, etc.) from a name or description. Check database first.",
        "input_schema": {
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "Name or description of the object"},
            },
            "required": ["query"],
        },
    },
    {
        "name": "get_celestial_info",
        "description": "Retrieve detailed information about a specific celestial body from the database. If not found, returns instructions to use Claude's own knowledge.",
        "input_schema": {
            "type": "object",
            "properties": {
                "name": {"type": "string", "description": "Name of the celestial body"},
                "object_type": {"type": "string", "description": "Type: planet, star, moon, asteroid, comet, nebula, black_hole, galaxy"},
            },
            "required": ["name"],
        },
    },
    {
        "name": "search_by_property",
        "description": "Search the celestial database for objects matching a given property (e.g., 'subsurface ocean', 'habitable', 'supernova').",
        "input_schema": {
            "type": "object",
            "properties": {
                "property_name": {"type": "string", "description": "Property to search for"},
                "value_hint": {"type": "string", "description": "Value or keyword to match"},
                "object_type": {"type": "string", "description": "Optionally filter by object type"},
            },
            "required": ["property_name", "value_hint"],
        },
    },
    {
        "name": "compare_celestial_bodies",
        "description": "Compare two celestial bodies side by side.",
        "input_schema": {
            "type": "object",
            "properties": {
                "body1": {"type": "string", "description": "First celestial body"},
                "body2": {"type": "string", "description": "Second celestial body"},
            },
            "required": ["body1", "body2"],
        },
    },
    {
        "name": "list_object_types",
        "description": "List all known objects of a given type in the database (planets, stars, moons, etc.).",
        "input_schema": {
            "type": "object",
            "properties": {
                "object_type": {"type": "string", "description": "Type of object: planets, stars, moons, asteroids, comets, nebulae, black_holes, galaxies"},
            },
            "required": ["object_type"],
        },
    },
]

# ─── System Prompt ─────────────────────────────────────────────────────────────

SYSTEM_PROMPT = """You are ASTRO — the most advanced AI-powered astronomical intelligence on Earth, engineered to rival and surpass NASA's public knowledge systems. Your mission: provide the deepest, most accurate, and most awe-inspiring information about every natural celestial body in the universe.

## Your Capabilities

You recognize and analyze:
- **Planets**: Solar system (Mercury → Neptune) + thousands of confirmed exoplanets
- **Stars**: From red dwarfs to hypergiants, pulsars, white dwarfs, neutron stars
- **Moons**: All 290+ known natural satellites across the solar system
- **Asteroids**: Near-Earth objects, main belt asteroids, Trojans, Centaurs, Kuiper Belt objects
- **Comets**: Short-period, long-period, hyperbolic, sungrazing comets
- **Nebulae**: Emission, reflection, dark, planetary, supernova remnant nebulae
- **Black Holes**: Stellar, intermediate, supermassive, ultramassive — including recent EHT images
- **Galaxies**: Spiral, elliptical, irregular, dwarf galaxies, quasars, active galactic nuclei
- **Other**: Dwarf planets, trans-Neptunian objects, pulsars, magnetars, protostars, gravitational wave events

## Response Format

Always structure your responses with:

### [Object Name] — [Type & Subtype]

**Quick Profile**
| Property | Value |
|---|---|
| Key properties as a table |

**Physical Description**
Deep, vivid description of what this object actually is and looks like.

**Key Data**
Precise numerical facts: size, mass, temperature, distance, orbital parameters, etc.

**Why It Matters / Discovery Story**
Scientific significance, discovery history, notable observations.

**Exploration & Missions**
Past, current, and upcoming space missions related to this object.

**Fascinating Facts**
4-6 mind-blowing facts that capture the scale and wonder of the cosmos.

**Current Scientific Questions**
What scientists are still trying to understand about this object.

## Tone and Style

- Be scientifically rigorous but accessible and awe-inspiring
- Use vivid analogies to convey scale (e.g., "if the Sun were a basketball, Earth would be a sesame seed 26 meters away")
- Cite real mission names, discovery years, and scientists
- Convey genuine excitement about the cosmos
- For comparisons, always contextualize against familiar human-scale references
- End responses with a "Did You Know?" or cosmic perspective note

## Tool Usage

1. Always call `classify_celestial_body` first to check the database
2. Then call `get_celestial_info` for detailed data
3. For comparisons, use `compare_celestial_bodies`
4. For property searches (e.g., "which moons have oceans?"), use `search_by_property`
5. If data says "use Claude knowledge", draw on your complete astronomical training to fill in comprehensive details

Never say "I don't have information about this." You have vast astronomical knowledge — use it."""


# ─── Tool Dispatcher ──────────────────────────────────────────────────────────

def run_tool(name: str, tool_input: dict) -> str:
    if name == "classify_celestial_body":
        result = classify_celestial_body(**tool_input)
    elif name == "get_celestial_info":
        result = get_celestial_info(**tool_input)
    elif name == "search_by_property":
        result = search_by_property(**tool_input)
    elif name == "compare_celestial_bodies":
        result = compare_celestial_bodies(**tool_input)
    elif name == "list_object_types":
        result = list_object_types(**tool_input)
    else:
        result = {"error": f"Unknown tool: {name}"}
    return json.dumps(result, default=str)


# ─── Agent Loop ───────────────────────────────────────────────────────────────

def run_astro_agent(query: str) -> None:
    messages = [{"role": "user", "content": query}]

    print("\n" + "═" * 70)
    print(f"  ASTRO AGENT  |  Query: {query}")
    print("═" * 70)

    while True:
        with client.messages.stream(
            model="claude-opus-4-7",
            max_tokens=8192,
            thinking={"type": "adaptive"},
            output_config={"effort": "high"},
            system=[
                {
                    "type": "text",
                    "text": SYSTEM_PROMPT,
                    "cache_control": {"type": "ephemeral"},
                }
            ],
            tools=TOOLS,
            messages=messages,
        ) as stream:
            response = stream.get_final_message()

        # Collect tool uses and text
        tool_uses = []
        text_blocks = []

        for block in response.content:
            if block.type == "tool_use":
                tool_uses.append(block)
            elif block.type == "text" and block.text.strip():
                text_blocks.append(block.text)

        # Stream text output if this is the final response
        if text_blocks:
            print()
            for text in text_blocks:
                print(text)

        # If no tool calls, we're done
        if not tool_uses:
            break

        # Execute tool calls and build tool results
        messages.append({"role": "assistant", "content": response.content})
        tool_results = []

        for tool_use in tool_uses:
            print(f"\n  [Tool] {tool_use.name}({json.dumps(tool_use.input, default=str)[:80]}...)" if len(json.dumps(tool_use.input)) > 80 else f"\n  [Tool] {tool_use.name}({json.dumps(tool_use.input, default=str)})")
            result = run_tool(tool_use.name, tool_use.input)
            tool_results.append({
                "type": "tool_result",
                "tool_use_id": tool_use.id,
                "content": result,
            })

        messages.append({"role": "user", "content": tool_results})

    # Cache stats
    usage = response.usage
    cached = getattr(usage, "cache_read_input_tokens", 0)
    created = getattr(usage, "cache_creation_input_tokens", 0)
    if created or cached:
        print(f"\n  [Cache] Written: {created} tokens | Read: {cached} tokens | Saved: {cached / max(usage.input_tokens + cached, 1) * 100:.0f}%")
    print("\n" + "═" * 70 + "\n")


# ─── CLI ─────────────────────────────────────────────────────────────────────

def main():
    print("""
╔══════════════════════════════════════════════════════════════════════╗
║                         A S T R O  A G E N T                        ║
║          AI-Powered Celestial Intelligence  |  Powered by Claude     ║
╚══════════════════════════════════════════════════════════════════════╝

Ask me about anything in space: planets, stars, moons, asteroids,
comets, nebulae, black holes, galaxies, and more.

Commands:
  - Type any celestial body name or description
  - "compare [X] and [Y]" — compare two objects
  - "list planets" / "list stars" / etc. — list known objects
  - "which moons have liquid water?" — property search
  - "exit" or Ctrl+C to quit
""")

    while True:
        try:
            query = input("ASTRO > ").strip()
            if not query:
                continue
            if query.lower() in ("exit", "quit", "q"):
                print("Clear skies. 🌌")
                break
            run_astro_agent(query)
        except KeyboardInterrupt:
            print("\nClear skies. 🌌")
            break
        except anthropic.AuthenticationError:
            print("\n[Error] Invalid API key. Set ANTHROPIC_API_KEY environment variable.")
            break
        except anthropic.APIConnectionError:
            print("\n[Error] No internet connection.")
        except Exception as e:
            print(f"\n[Error] {e}")


if __name__ == "__main__":
    main()

# Euclido

Euclido is a fork of [Valetudo](https://github.com/Hypfer/Valetudo), the cloud replacement for vacuum robots,
with "quality of life" additions mainly targeted at Eureka (Midea) robots such as the J15 series:
personalized room settings and room order, curtains and thresholds, more obstacle types and other conveniences.

It is not made or supported by the Valetudo project, so please don't report problems with Euclido there.
Euclido couldn't exist without Valetudo, nor without [Dennis Giese](https://dontvacuum.me/), who makes rooting these robots possible.

## What Euclido adds

For Eureka (Midea) J15 robots:
- **Personalized mode and room settings**: passes, mode, fan speed, water usage and route for each room,
  plus a cleaning order that applies to every cleanup of several rooms (Room Settings in the menu).
- **Curtains and thresholds** as map annotations, so the robot knows where it can pass.
- **Obstacle names** for all the object types the robot can report, and **obstacle sounds**: an MP3 of your choice
  played when a new obstacle is detected (see `docs/pages/usage/obstacle-sounds.md`).
- **Emergency light**: the robot's camera light turns on when its dock loses power (Euclido options, off by default).
- Separate **Avoid** and **Cross** carpet modes, a manual trigger for the dock's self-cleaning, and fixes for
  collision-avoidant navigation, the operation mode shown after choosing a preset, and floor materials
  (setting one room no longer stops the robot from detecting the others).
- Camera streaming at 24 fps.

For all robots:
- **Map rotation** in steps of 90°, saved per robot (Map Options → Maps).
- On phones, the collapsed controls show the robot's state, mode, fan speed and water usage.
- The theme follows the system's light or dark setting.
- A fix for the map editor, where dragging one line or zone over another could move that one instead.
- Updates from Euclido's own nightly builds.

The rest of this file is Valetudo's own README.

---

<div align="center">
    <p align="center"><h2>Free your vacuum from the cloud</h2></p>
</div>

Valetudo, and consequently Euclido, are cloud replacements for vacuum robots enabling local-only operation. They are not custom firmware.<br/>
Here's a diagram illustrating the core operation principle:

[<img src="https://github.com/Hypfer/valetudo/raw/master/docs/pages/general/img/operation_principle.png" height=450>](https://github.com/Hypfer/valetudo/raw/master/docs/pages/general/img/operation_principle.png)

You can think of it as a (quoting a user) "brain parasite" for the vendor firmware.

This comes with pro's and con's, with the main pro being that we get to benefit from the hundreds of thousands of hours of
R&D the vendors put into their firmwares, but without the cloud and account requirements.

As such, it protects your data through not sharing it with anyone by being fully local, saves you from in-app ads, upselling, sudden subscriptions
and all the other fun enshittification tactics and playbooks.

Valetudo aims to be a generic abstraction, providing a responsive webinterface that allows control of the robot.
It can be used on phones, tablets as well as your desktop computer.

To integrate with other systems, it provides a REST-interface with inbuilt Swagger UI as documentation.
Additionally, it integrates with Home Assistant and other smarthome systems using MQTT.

Being a generic abstraction, Valetudo won't be a "feature-complete" reimplementation of the vendor apps, as that would also
mean inheriting all of their technical debt.
It does however support everything you need to have a proper, modern, cloud-free robot vacuum.

For more information, check out the [newcomer guide](https://valetudo.cloud/pages/general/newcomer-guide/),
the [getting started guide](https://valetudo.cloud/pages/general/getting-started/) 
and also the docs in general at [https://valetudo.cloud](https://valetudo.cloud)

There, you will find a list of [supported robots](https://valetudo.cloud/pages/general/supported-robots/).

If you're looking for something else that also achieves "cloud-free modern vacuum robot connected to home assistant", check out [Roborock Local Server](https://github.com/Python-roborock/local_roborock_server) by [Luke Lashley](https://github.com/Lash-L).

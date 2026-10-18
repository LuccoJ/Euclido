# Euclido

Euclido is a fork of [Valetudo](https://github.com/Hypfer/Valetudo), the cloud replacement for vacuum robots,
with "quality of life" additions mainly targeted at Eureka (Midea) robots such as the J15 series:
personalized room settings and room order, curtains and thresholds, more obstacle types and other conveniences.

It is not made or supported by the Valetudo project, so please don't report problems with Euclido there.
Euclido couldn't exist without Valetudo, nor without [Dennis Giese](https://dontvacuum.me/), who makes rooting these robots possible.

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

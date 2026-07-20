---
slug: ninth-vale
name: The Ninth Vale
genre: Fantasy
color: oklch(0.68 0.1 38)
logline: A guild cartographer races the rising tide to recover the ninth map before the Order burns what is left of the drowned coast.
eraOrder: [era-founding, era-charts, era-drowning, era-saltcinder]
activeEra: era-saltcinder
rootMap: drowned-coast
categoryTemplates:
  - category: characters
    properties:
      - key: aliases
        label: Aliases
        type: text
      - key: portrait
        label: Portrait
        type: image
      - key: age
        label: Age
        type: number
      - key: role
        label: Role
        type: text
      - key: affiliations
        label: Affiliations
        type: relation
        targetCategories: [organizations]
      - key: origin
        label: Origin
        type: relation
        targetCategories: [locations]
  - category: locations
    properties:
      - key: type
        label: Type
        type: select
        options: [City, Region, Building, Landmark, Wilds]
      - key: parent
        label: Parent
        type: relation
        targetCategories: [locations]
      - key: inhabitants
        label: Inhabitants
        type: relation
        targetCategories: [characters]
  - category: events
    properties:
      - key: period
        label: Period
        type: text
      - key: participants
        label: Participants
        type: relation
      - key: place
        label: Place
        type: relation
        targetCategories: [locations]
      - key: consequences
        label: Consequences
        type: textarea
  - category: stories
    properties:
      - key: status
        label: Status
        type: select
        options: [Draft, In progress, Complete]
      - key: synopsis
        label: Synopsis
        type: textarea
      - key: cast
        label: Cast
        type: relation
        targetCategories: [characters]
  - category: items
    properties:
      - key: type
        label: Type
        type: select
        options: [Artifact, Weapon, Material, Relic, Everyday]
      - key: owner
        label: Owner
        type: relation
        targetCategories: [characters]
      - key: origin
        label: Origin
        type: relation
        targetCategories: [locations]
  - category: eras
    properties:
      - key: datelabel
        label: Date Label
        type: text
  - category: organizations
    properties:
      - key: type
        label: Type
        type: select
        options: [Guild, Order, House, Cult, State]
      - key: leader
        label: Leader
        type: relation
        targetCategories: [characters]
      - key: hq
        label: HQ
        type: relation
        targetCategories: [locations]
      - key: members
        label: Members
        type: relation
        targetCategories: [characters]
maps:
  - id: drowned-coast
    title: The Drowned Coast
    eraLinked: true
    images:
      era-founding: /maps/drowned-coast-founding.svg
      era-charts: /maps/drowned-coast-charts.svg
      era-saltcinder: /maps/drowned-coast-saltcinder.svg
  - id: ninth-vale
    title: The Ninth Vale
    eraLinked: false
    images:
      all: /maps/ninth-vale.svg
    parentMap: drowned-coast
    parentPin: pin-ninth-vale
  - id: duskwater
    title: Duskwater
    eraLinked: false
    images:
      all: /maps/duskwater.svg
    parentMap: drowned-coast
    parentPin: pin-duskwater
  - id: ashthorn-keep
    title: Ashthorn Keep
    eraLinked: false
    images:
      all: /maps/ashthorn-keep.svg
    parentMap: duskwater
    parentPin: pin-ashthorn-keep
pins:
  - id: pin-ninth-vale
    mapId: drowned-coast
    pageSlug: ninth-vale
    x: 62.5
    y: 35
    eras: []
    childMap: ninth-vale
  - id: pin-duskwater
    mapId: drowned-coast
    pageSlug: duskwater
    x: 40
    y: 58
    eras: [era-charts, era-drowning, era-saltcinder]
    childMap: duskwater
  - id: pin-the-sundering
    mapId: drowned-coast
    pageSlug: the-sundering
    x: 70
    y: 22
    eras: [era-drowning]
  - id: pin-order-ember
    mapId: drowned-coast
    pageSlug: order-ember
    x: 22
    y: 44
    eras: [era-drowning, era-saltcinder]
  - id: pin-highland-stair
    mapId: ninth-vale
    pageSlug: highland-stair
    x: 30
    y: 20
    eras: [era-charts, era-saltcinder]
  - id: pin-corin
    mapId: ninth-vale
    pageSlug: corin
    x: 58
    y: 42
    eras: [era-drowning, era-saltcinder]
  - id: pin-hollow-king
    mapId: ninth-vale
    pageSlug: hollow-king
    x: 75
    y: 65
    eras: [era-drowning]
  - id: pin-drowned-quarter
    mapId: duskwater
    pageSlug: drowned-quarter
    x: 25
    y: 70
    eras: [era-drowning, era-saltcinder]
  - id: pin-guild-hall
    mapId: duskwater
    pageSlug: guild-hall
    x: 45
    y: 30
    eras: [era-charts, era-saltcinder]
  - id: pin-harbor-gate
    mapId: duskwater
    pageSlug: harbor-gate
    x: 65
    y: 55
    eras: [era-charts, era-drowning, era-saltcinder]
  - id: pin-salt-market
    mapId: duskwater
    pageSlug: salt-market
    x: 50
    y: 68
    eras: [era-saltcinder]
  - id: pin-ashthorn-keep
    mapId: duskwater
    pageSlug: ashthorn-keep
    x: 80
    y: 25
    eras: [era-charts, era-drowning, era-saltcinder]
    childMap: ashthorn-keep
  - id: pin-sera-charts
    mapId: duskwater
    pageSlug: sera
    x: 42
    y: 34
    eras: [era-charts]
  - id: pin-sera-saltcinder
    mapId: duskwater
    pageSlug: sera
    x: 66
    y: 52
    eras: [era-saltcinder]
  - id: pin-keep-hall
    mapId: ashthorn-keep
    pageSlug: keep-hall
    x: 50
    y: 50
    eras: [era-charts, era-drowning, era-saltcinder]
  - id: pin-keep-tower
    mapId: ashthorn-keep
    pageSlug: keep-tower
    x: 78
    y: 30
    eras: [era-drowning, era-saltcinder]
  - id: pin-keep-court
    mapId: ashthorn-keep
    pageSlug: keep-court
    x: 30
    y: 68
    eras: [era-charts, era-saltcinder]
canvas:
  items:
    - id: canvas-note-title
      kind: text
      x: 120
      y: 72
      width: 280
      height: 44
      rotation: 0
      color: "#f4efe6"
      text: "Drowned Coast — reference board"
    - id: canvas-note-tides
      kind: sticky
      x: 120
      y: 152
      width: 208
      height: 152
      rotation: -3
      color: "#d8aa61"
      text: "Tide readings: compare the ninth bell against the drowned stair."
    - id: canvas-note-route
      kind: sticky
      x: 384
      y: 232
      width: 200
      height: 144
      rotation: 2
      color: "#9bc4a5"
      text: "Safer route through Duskwater after moonrise."
    - id: canvas-note-order
      kind: sticky
      x: 208
      y: 360
      width: 216
      height: 140
      rotation: 0
      color: "#d99579"
      text: "The Order burns any chart that names the ninth vale."
  links: []
created: 2026-01-01T00:00:00.000Z
updated: 2026-07-13T00:00:00.000Z
---

The Ninth Vale began as one guild cartographer's private obsession: a coastline that would not hold still on any two charts. It has become the last honest map of a coast the Order of the Ember would rather everyone forget ever drowned.

Sera Valen carries the only compass that still points toward what's missing. Everything else here — the guild, the keep, the tide itself — is arranged around that one fact.

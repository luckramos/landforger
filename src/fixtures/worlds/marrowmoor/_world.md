---
slug: marrowmoor
name: Marrowmoor
genre: Horror
color: oklch(0.68 0.1 350)
logline: A fog-drowned heath keeps a reliquary keeper who has outlived every pilgrim sent to relieve her.
eraOrder: [the-hush]
activeEra: the-hush
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
maps: []
pins: []
created: 2026-01-01T00:00:00.000Z
updated: 2026-07-13T00:00:00.000Z
---

A skeleton world: the heath, its keeper, and the hush that swallows everyone sent to relieve her. No maps yet — this world hasn't earned one.

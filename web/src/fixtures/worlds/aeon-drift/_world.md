---
slug: aeon-drift
name: Aeon Drift
genre: Science Fiction
color: oklch(0.68 0.1 255)
logline: A generation ark that forgot its destination drifts on, its passengers rewriting why they ever left.
eraOrder: [the-departure]
activeEra: the-departure
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

The ark, its turning spindle, and the order of Rememberers that keeps its logs disagreeing on purpose. No maps yet — this world hasn't earned one.

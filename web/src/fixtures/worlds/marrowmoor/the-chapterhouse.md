---
slug: the-chapterhouse
title: The Chapterhouse
category: organizations
tags: [order, fog]
summary: The inland order that keeps sending pilgrims to relieve the Keeper of Marrowmoor, and keeps quietly not counting how few come back.
eras: [the-hush]
properties:
  - key: type
    label: Type
    type: select
    options: [Guild, Order, House, Cult, State]
    value: Order
  - key: leader
    label: Leader
    type: relation
    targetCategories: [characters]
    value: []
  - key: hq
    label: HQ
    type: relation
    targetCategories: [locations]
    value: [vigil-parish]
  - key: members
    label: Members
    type: relation
    targetCategories: [characters]
    value: [elin-marsh]
created: 2026-01-01T00:00:00.000Z
updated: 2026-07-14T00:00:00.000Z
---
The Chapterhouse sits at [[vigil-parish]], the last dry ground before the fog of [[the-heath]] closes in, and for as long as its own records run it has sent one pilgrim after another to relieve [[mira-thorne]] of the reliquary. It marks each as "posted," never as "returned," and has never once corrected the discrepancy — [[elin-marsh]] was only the most recent to walk out and not walk back.

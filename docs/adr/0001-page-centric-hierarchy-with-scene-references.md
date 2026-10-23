# Page-centric layout hierarchy with scene references

In comics, a narrative Scene frequently spans multiple Pages, and two short Scenes can share a single Page. We model the physical layout hierarchy as `Comic → Page[] → Panel[]` while storing `Scene[]` as a parallel narrative list on the `Comic`, linked via `Panel.sceneId`. This keeps page pagination, panel grid sizing, and whole-page selection clean without forcing artificial page breaks at scene boundaries.

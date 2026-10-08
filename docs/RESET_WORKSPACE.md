# Reset / Clean Slate

VentureIQ is designed to start with no sample startup data.

The UI Reset action does two things:

1. `POST /api/reset` clears the active in-memory dataset.
2. Browser local storage for `vq-watchlist` is cleared.

After reset, the UI returns to the Find tab with zero startups and no selected record. Upload a new dataset to create the next workspace.

async function removeCardFromAlbums(db, userId, code) {

  const albumsCol =
    db.collection("albums");

  const albums =
    await albumsCol.find({
      userId
    }).toArray();

  for (const album of albums) {

    let changed = false;

    for (const page of album.pages || []) {

      if (!Array.isArray(page.slots))
        continue;

      page.slots =
        page.slots.map(slot => {

          if (
            slot &&
            slot.code &&
            slot.code.toLowerCase() ===
            code.toLowerCase()
          ) {

            changed = true;

            return null;

          }

          return slot;

        });

    }

    if (changed) {

      await albumsCol.updateOne(

        {
          _id:
            album._id
        },

        {
          $set: {
            pages:
              album.pages
          }
        }

      );

    }

  }

}

module.exports = {
  removeCardFromAlbums
};
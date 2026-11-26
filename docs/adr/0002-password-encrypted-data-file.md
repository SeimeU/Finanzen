# Data file is encrypted with a password, with no recovery

The data file, and every automatic backup of it, is encrypted with a password the owner enters each time the app starts. We chose this over plain JSON protected only by the Windows login because the file holds the owner's complete financial picture and may end up in synced folders or on other disks. The deliberate consequence: a forgotten password means the data cannot be recovered, and the file can no longer be read or fixed by hand without the app.

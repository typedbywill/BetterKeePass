package app.betterkeepass.ui.components

import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.*
import androidx.compose.ui.graphics.vector.ImageVector

/** Standard KeePass icon ids mapped to Material icons, following the desktop mapping. */
internal fun keepassIcon(id: Int): ImageVector? = when (id) {
    0, 29 -> Icons.Outlined.VpnKey
    1 -> Icons.Outlined.Language
    2 -> Icons.Outlined.Warning
    3 -> Icons.Outlined.Dns
    4 -> Icons.Outlined.Bookmark
    5, 55 -> Icons.Outlined.Group
    6, 56 -> Icons.Outlined.Forum
    7, 17, 27, 46 -> Icons.Outlined.Storage
    8, 12, 18 -> Icons.Outlined.Wifi
    9, 19, 25, 40 -> Icons.Outlined.Email
    10 -> Icons.Outlined.AttachFile
    11, 35 -> Icons.Outlined.Computer
    13, 32 -> Icons.Outlined.Settings
    14 -> Icons.Outlined.Info
    15, 30, 37 -> Icons.Outlined.Terminal
    16, 31 -> Icons.Outlined.Print
    20, 26, 44 -> Icons.Outlined.Description
    21, 47 -> Icons.Outlined.Inventory2
    22, 60, 61 -> Icons.Outlined.Home
    23 -> Icons.Outlined.Cloud
    24, 36 -> Icons.Outlined.Archive
    28, 51 -> Icons.Outlined.Lock
    33 -> Icons.Outlined.Search
    34, 53 -> Icons.Outlined.Build
    38 -> Icons.Outlined.Smartphone
    39 -> Icons.Outlined.Schedule
    41 -> Icons.Outlined.Tune
    42 -> Icons.Outlined.Storage
    43 -> Icons.Outlined.Delete
    45, 68 -> Icons.Outlined.Shield
    48 -> Icons.Outlined.Folder
    49 -> Icons.Outlined.FolderOpen
    50 -> Icons.Outlined.Book
    52 -> Icons.Outlined.CheckCircle
    54 -> Icons.Outlined.Person
    57 -> Icons.Outlined.PhotoCamera
    58 -> Icons.Outlined.MusicNote
    59 -> Icons.Outlined.SportsEsports
    62, 66 -> Icons.Outlined.CreditCard
    63 -> Icons.Outlined.ShoppingCart
    64 -> Icons.Outlined.Work
    65 -> Icons.Outlined.AccountBalance
    67 -> Icons.Outlined.Business
    else -> null
}

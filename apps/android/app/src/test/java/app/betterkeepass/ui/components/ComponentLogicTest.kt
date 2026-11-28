package app.betterkeepass.ui.components

import org.junit.Assert.assertEquals
import org.junit.Test

class ComponentLogicTest {
    @Test
    fun passwordStrengthMatchesDesktopThresholds() {
        assertEquals(0, passwordStrength(""))
        assertEquals(1, passwordStrength("abc"))
        assertEquals(2, passwordStrength("abcdefgh1!"))
        assertEquals(3, passwordStrength("Abcdefgh1!"))
        assertEquals(4, passwordStrength("Abcdefgh1!xyzwvu"))
    }

    @Test
    fun initialsUseUpToTwoLetters() {
        assertEquals("?", initialsFrom("   "))
        assertEquals("GI", initialsFrom("github"))
        assertEquals("MB", initialsFrom("my bank account"))
    }
}

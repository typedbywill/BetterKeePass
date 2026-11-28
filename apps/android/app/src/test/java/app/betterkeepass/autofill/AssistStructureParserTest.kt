package app.betterkeepass.autofill

import android.text.InputType
import android.view.View
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class AssistStructureParserTest {

    @Test
    fun classifyField_detectsAutofillHints() {
        assertEquals(
            AutofillFieldRole.USERNAME,
            AssistStructureParser.classifyField(
                autofillHints = listOf(View.AUTOFILL_HINT_USERNAME),
                inputType = InputType.TYPE_CLASS_TEXT,
                hint = null,
                idEntry = null,
            ),
        )
        assertEquals(
            AutofillFieldRole.PASSWORD,
            AssistStructureParser.classifyField(
                autofillHints = listOf(View.AUTOFILL_HINT_PASSWORD),
                inputType = InputType.TYPE_CLASS_TEXT,
                hint = null,
                idEntry = null,
            ),
        )
    }

    @Test
    fun classifyField_detectsPasswordInputTypeAndHeuristics() {
        assertEquals(
            AutofillFieldRole.PASSWORD,
            AssistStructureParser.classifyField(
                autofillHints = emptyList(),
                inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_PASSWORD,
                hint = null,
                idEntry = null,
            ),
        )
        assertEquals(
            AutofillFieldRole.USERNAME,
            AssistStructureParser.classifyField(
                autofillHints = emptyList(),
                inputType = InputType.TYPE_CLASS_TEXT,
                hint = "E-mail corporativo",
                idEntry = "login_user",
            ),
        )
        assertNull(
            AssistStructureParser.classifyField(
                autofillHints = emptyList(),
                inputType = InputType.TYPE_CLASS_TEXT,
                hint = "Buscar",
                idEntry = "search_box",
            ),
        )
    }

    @Test
    fun domainMatcher_usesPublicSuffix() {
        assertEquals("github.com", DomainMatcher.registrableDomain("https://gist.github.com/login"))
        assertEquals("bbc.co.uk", DomainMatcher.registrableDomain("accounts.bbc.co.uk"))
        assertNull(DomainMatcher.registrableDomain("   "))
    }
}

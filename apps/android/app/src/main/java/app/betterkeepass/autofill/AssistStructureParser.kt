package app.betterkeepass.autofill

import android.app.assist.AssistStructure
import android.text.InputType
import android.view.View
import android.view.autofill.AutofillId

enum class AutofillFieldRole {
    USERNAME,
    PASSWORD,
}

data class ParsedAutofillStructure(
    val packageName: String?,
    val webDomain: String?,
    val usernameId: AutofillId?,
    val passwordId: AutofillId?,
    val usernameValue: String?,
    val passwordValue: String?,
)

object AssistStructureParser {

    fun parse(structure: AssistStructure): ParsedAutofillStructure {
        var packageName: String? = structure.activityComponent?.packageName
        var webDomain: String? = null
        var usernameId: AutofillId? = null
        var passwordId: AutofillId? = null
        var usernameValue: String? = null
        var passwordValue: String? = null

        fun traverse(node: AssistStructure.ViewNode) {
            if (packageName.isNullOrBlank() && !node.idPackage.isNullOrBlank()) {
                packageName = node.idPackage
            }
            if (webDomain.isNullOrBlank() && !node.webDomain.isNullOrBlank()) {
                webDomain = node.webDomain
            }

            val role = classifyField(
                autofillHints = node.autofillHints?.toList().orEmpty(),
                inputType = node.inputType,
                hint = node.hint,
                idEntry = node.idEntry,
            )
            val textVal = node.autofillValue?.takeIf { it.isText }?.textValue?.toString()
            when (role) {
                AutofillFieldRole.USERNAME -> {
                    if (usernameId == null) usernameId = node.autofillId
                    if (usernameValue.isNullOrBlank() && !textVal.isNullOrBlank()) {
                        usernameValue = textVal
                    }
                }
                AutofillFieldRole.PASSWORD -> {
                    if (passwordId == null) passwordId = node.autofillId
                    if (passwordValue.isNullOrBlank() && !textVal.isNullOrBlank()) {
                        passwordValue = textVal
                    }
                }
                null -> Unit
            }

            for (i in 0 until node.childCount) {
                traverse(node.getChildAt(i))
            }
        }

        for (i in 0 until structure.windowNodeCount) {
            structure.getWindowNodeAt(i).rootViewNode?.let(::traverse)
        }

        return ParsedAutofillStructure(
            packageName = packageName,
            webDomain = DomainMatcher.registrableDomain(webDomain),
            usernameId = usernameId,
            passwordId = passwordId,
            usernameValue = usernameValue,
            passwordValue = passwordValue,
        )
    }

    fun classifyField(
        autofillHints: List<String>,
        inputType: Int,
        hint: String?,
        idEntry: String?,
    ): AutofillFieldRole? {
        val hintsLower = autofillHints.map { it.lowercase() }
        if (hintsLower.any {
                it == View.AUTOFILL_HINT_PASSWORD || it.contains("password") || it == "newpassword"
            }
        ) {
            return AutofillFieldRole.PASSWORD
        }
        if (hintsLower.any {
                it == View.AUTOFILL_HINT_USERNAME ||
                    it == View.AUTOFILL_HINT_EMAIL_ADDRESS ||
                    it.contains("username") ||
                    it.contains("email")
            }
        ) {
            return AutofillFieldRole.USERNAME
        }

        val variation = inputType and InputType.TYPE_MASK_VARIATION
        val cls = inputType and InputType.TYPE_MASK_CLASS
        if (cls == InputType.TYPE_CLASS_TEXT && (
                variation == InputType.TYPE_TEXT_VARIATION_PASSWORD ||
                    variation == InputType.TYPE_TEXT_VARIATION_WEB_PASSWORD ||
                    variation == InputType.TYPE_TEXT_VARIATION_VISIBLE_PASSWORD
                )
        ) {
            return AutofillFieldRole.PASSWORD
        }

        val combined = listOfNotNull(hint, idEntry).joinToString(" ").lowercase()
        if (combined.contains("pass") || combined.contains("senha")) {
            return AutofillFieldRole.PASSWORD
        }
        if (combined.contains("user") ||
            combined.contains("email") ||
            combined.contains("login") ||
            combined.contains("usuario")
        ) {
            return AutofillFieldRole.USERNAME
        }
        if (cls == InputType.TYPE_CLASS_TEXT &&
            variation == InputType.TYPE_TEXT_VARIATION_EMAIL_ADDRESS
        ) {
            return AutofillFieldRole.USERNAME
        }

        return null
    }
}

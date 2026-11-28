package app.betterkeepass.autofill

import okhttp3.HttpUrl

object DomainMatcher {
    fun registrableDomain(rawHostOrUrl: String?): String? {
        val raw = rawHostOrUrl?.trim()?.lowercase()?.takeIf { it.isNotEmpty() } ?: return null
        val host = raw.substringAfter("://")
            .substringBefore('/')
            .substringBefore('?')
            .substringBefore('#')
            .substringAfterLast('@')
            .substringBefore(':')
            .trim('.')
        if (host.isEmpty()) return null

        val url = HttpUrl.Builder()
            .scheme("https")
            .host(host)
            .build()
        return url.topPrivateDomain() ?: host
    }
}

package dev.pi.web

import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/**
 * Password-at-rest encryption backed by the Android Keystore, the counterpart
 * of Electron's `safeStorage` on the desktop client. An unusable key means
 * "do not store", never plaintext.
 */
object PasswordCipher {
    private const val KEYSTORE = "AndroidKeyStore"
    private const val KEY_ALIAS = "pi-web-ssh-passwords"
    private const val TRANSFORMATION = "AES/GCM/NoPadding"
    private const val PREFIX = "v1:"
    private const val IV_BYTES = 12
    private const val TAG_BITS = 128

    fun isAvailable(): Boolean = runCatching { secretKey() }.isSuccess

    /** Returns `v1:<base64(iv + ciphertext)>`, or null when the key is unusable. */
    fun encrypt(plaintext: String): String? = runCatching {
        val cipher = Cipher.getInstance(TRANSFORMATION)
        cipher.init(Cipher.ENCRYPT_MODE, secretKey())
        val payload = cipher.iv + cipher.doFinal(plaintext.toByteArray(Charsets.UTF_8))
        PREFIX + Base64.encodeToString(payload, Base64.NO_WRAP)
    }.getOrNull()

    /** Returns null for unknown formats and for values this Keystore cannot decrypt. */
    fun decrypt(stored: String): String? {
        if (!stored.startsWith(PREFIX)) return null
        return runCatching {
            val payload = Base64.decode(stored.removePrefix(PREFIX), Base64.NO_WRAP)
            require(payload.size > IV_BYTES) { "truncated payload" }
            val cipher = Cipher.getInstance(TRANSFORMATION)
            cipher.init(Cipher.DECRYPT_MODE, secretKey(), GCMParameterSpec(TAG_BITS, payload, 0, IV_BYTES))
            String(cipher.doFinal(payload, IV_BYTES, payload.size - IV_BYTES), Charsets.UTF_8)
        }.getOrNull()
    }

    private fun secretKey(): SecretKey {
        val keyStore = KeyStore.getInstance(KEYSTORE).apply { load(null) }
        (keyStore.getEntry(KEY_ALIAS, null) as? KeyStore.SecretKeyEntry)?.let { return it.secretKey }
        val generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, KEYSTORE)
        generator.init(
            KeyGenParameterSpec.Builder(KEY_ALIAS, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setRandomizedEncryptionRequired(true)
                .build(),
        )
        return generator.generateKey()
    }
}

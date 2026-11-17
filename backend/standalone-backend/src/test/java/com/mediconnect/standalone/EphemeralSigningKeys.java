package com.mediconnect.standalone;

import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.attribute.PosixFilePermissions;
import java.security.KeyPairGenerator;
import java.util.Base64;
import org.springframework.test.context.DynamicPropertyRegistry;

/** Test-only keys exist only in this JVM's temporary directory, never Git/resources. */
final class EphemeralSigningKeys {
    private EphemeralSigningKeys() {}
    static void configure(DynamicPropertyRegistry properties) {
        try {
            var generator = KeyPairGenerator.getInstance("RSA"); generator.initialize(2048);
            var pair = generator.generateKeyPair();
            Path directory = Files.createTempDirectory("mediconnect-test-keys-");
            Path privateFile = directory.resolve("private.pem"), publicFile = directory.resolve("public.pem");
            directory.toFile().deleteOnExit(); publicFile.toFile().deleteOnExit(); privateFile.toFile().deleteOnExit();
            var encoder = Base64.getMimeEncoder(64, new byte[]{'\n'});
            Files.writeString(privateFile, "-----BEGIN PRIVATE KEY-----\n" + encoder.encodeToString(pair.getPrivate().getEncoded()) + "\n-----END PRIVATE KEY-----\n");
            Files.writeString(publicFile, "-----BEGIN PUBLIC KEY-----\n" + encoder.encodeToString(pair.getPublic().getEncoded()) + "\n-----END PUBLIC KEY-----\n");
            if (Files.getFileStore(directory).supportsFileAttributeView("posix"))
                Files.setPosixFilePermissions(privateFile, PosixFilePermissions.fromString("rw-------"));
            properties.add("security.jwt.public-key", () -> publicFile.toUri().toString());
            properties.add("security.jwt.private-key", () -> privateFile.toUri().toString());
        } catch (Exception exception) { throw new IllegalStateException("Could not prepare ephemeral test signing keys"); }
    }
}

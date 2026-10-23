package com.mediconnect.patient.application;

public class PatientException extends RuntimeException {
    public enum Kind { NOT_FOUND, EMAIL_TAKEN, STALE_VERSION }
    private final Kind kind;

    public PatientException(Kind kind) {
        super(switch (kind) {
            case NOT_FOUND -> "Patient not found.";
            case EMAIL_TAKEN -> "A patient with this email already exists.";
            case STALE_VERSION -> "This patient was changed by another request. Fetch the latest version and try again.";
        });
        this.kind = kind;
    }

    public Kind getKind() { return kind; }
}

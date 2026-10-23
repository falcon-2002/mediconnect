package com.mediconnect.patient.api;

import com.mediconnect.patient.application.PatientException;
import java.time.Clock;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.dao.OptimisticLockingFailureException;
import org.springframework.http.*;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.context.request.WebRequest;
import org.springframework.web.servlet.mvc.method.annotation.ResponseEntityExceptionHandler;

@RestControllerAdvice
public class ApiExceptionHandler extends ResponseEntityExceptionHandler {
    private final Clock clock;
    public ApiExceptionHandler(Clock clock) { this.clock = clock; }

    @ExceptionHandler(PatientException.class)
    ProblemDetail patientError(PatientException exception) {
        var status = exception.getKind() == PatientException.Kind.NOT_FOUND ? HttpStatus.NOT_FOUND : HttpStatus.CONFLICT;
        return problem(status, exception.getKind().name(), exception.getMessage());
    }

    @ExceptionHandler(DataIntegrityViolationException.class)
    ProblemDetail dataConflict(DataIntegrityViolationException exception) {
        // Do not echo SQL or patient values from the database exception.
        return problem(HttpStatus.CONFLICT, "DATA_CONFLICT", "The patient conflicts with an existing record or database constraint.");
    }

    @ExceptionHandler(OptimisticLockingFailureException.class)
    ProblemDetail staleWrite(OptimisticLockingFailureException exception) {
        return problem(HttpStatus.CONFLICT, "STALE_VERSION", "This patient changed during your request. Fetch it again before updating.");
    }

    @Override
    protected ResponseEntity<Object> handleMethodArgumentNotValid(MethodArgumentNotValidException exception,
            HttpHeaders headers, HttpStatusCode status, WebRequest request) {
        var body = problem(HttpStatus.BAD_REQUEST, "VALIDATION_ERROR", "Some fields are invalid.");
        Map<String, String> errors = new LinkedHashMap<>();
        exception.getBindingResult().getFieldErrors().forEach(error -> errors.putIfAbsent(error.getField(), error.getDefaultMessage()));
        body.setProperty("fieldErrors", errors);
        return handleExceptionInternal(exception, body, headers, status, request);
    }

    @Override
    protected ResponseEntity<Object> handleHttpMessageNotReadable(HttpMessageNotReadableException exception,
            HttpHeaders headers, HttpStatusCode status, WebRequest request) {
        return handleExceptionInternal(exception,
                problem(HttpStatus.BAD_REQUEST, "INVALID_JSON", "Use valid JSON and ISO dates in yyyy-MM-dd format."),
                headers, status, request);
    }

    private ProblemDetail problem(HttpStatus status, String code, String detail) {
        var body = ProblemDetail.forStatusAndDetail(status, detail);
        body.setTitle(status.getReasonPhrase());
        body.setProperty("code", code);
        body.setProperty("timestamp", Instant.now(clock));
        return body;
    }
}

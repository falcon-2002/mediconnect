package com.mediconnect.auth.api;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.servlet.mvc.method.annotation.ResponseEntityExceptionHandler;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.*;
@RestControllerAdvice
public class ApiExceptionHandler extends ResponseEntityExceptionHandler {
 @ExceptionHandler(DataIntegrityViolationException.class)
 ProblemDetail conflict(DataIntegrityViolationException ex){
  return ProblemDetail.forStatusAndDetail(HttpStatus.CONFLICT,"Account could not be created because it conflicts with an existing record.");
 }
}

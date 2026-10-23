package com.mediconnect.patient.api;

import java.util.List;

public record PatientPage(List<PatientResponse> items, int page, int size, long totalItems, int totalPages) { }

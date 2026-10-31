package com.mediconnect.doctor.api;
import java.util.List;
public record DoctorPage(List<DoctorResponse> items,int page,int size,long totalItems,int totalPages) {}

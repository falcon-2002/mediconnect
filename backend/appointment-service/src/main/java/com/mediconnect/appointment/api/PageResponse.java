package com.mediconnect.appointment.api;
import java.util.List;
import org.springframework.data.domain.Page;
public record PageResponse<T>(List<T> items,int page,int size,long totalItems,int totalPages){
 public static <T> PageResponse<T> of(Page<T> p){return new PageResponse<>(p.getContent(),p.getNumber(),p.getSize(),p.getTotalElements(),p.getTotalPages());}
}

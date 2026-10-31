package com.mediconnect.doctor.application;
import com.mediconnect.doctor.api.*;
import com.mediconnect.doctor.domain.Doctor;
import com.mediconnect.doctor.config.DoctorCatalog;
import com.mediconnect.doctor.persistence.DoctorRepository;
import java.util.*;
import java.math.BigDecimal;
import java.time.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.data.domain.*;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;
@Service @Transactional(readOnly=true)
public class DoctorService {
    private final DoctorRepository repository;
    private final DoctorCatalog catalog;
    private final Clock clock;
    public DoctorService(DoctorRepository repository,DoctorCatalog catalog,Clock clock){this.repository=repository;this.catalog=catalog;this.clock=clock;}
    public DoctorResponse get(UUID id){return DoctorResponse.from(active(id));}
    public DoctorPage search(String query,String city,String specialty,BigDecimal maxFee,String sort,int page,int size){
        if(!city.isEmpty()&&!catalog.cities().contains(city)) bad("Unknown city");
        if(!specialty.isEmpty()&&!catalog.specialties().containsKey(specialty)) bad("Unknown specialty");
        Sort order=switch(sort){
            case "name" -> Sort.by("name");
            case "fee" -> Sort.by("feeInRupees").and(Sort.by("name"));
            case "experience" -> Sort.by(Sort.Direction.DESC,"experienceYears").and(Sort.by("name"));
            default -> throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"Unknown sort; use name, fee or experience");
        };
        Specification<Doctor> filter=(root,q,cb)->{
            var terms=new ArrayList<jakarta.persistence.criteria.Predicate>();
            terms.add(cb.isTrue(root.get("active")));
            if(!city.isEmpty())terms.add(cb.equal(root.get("city"),city));
            if(!specialty.isEmpty())terms.add(cb.equal(root.get("specialty"),specialty));
            if(maxFee!=null)terms.add(cb.le(root.get("feeInRupees"),maxFee));
            for(String word:query.toLowerCase(Locale.ROOT).strip().split("\\s+")){
                if(word.isEmpty())continue;
                String literal="%"+word.replace("!","!!").replace("%","!%").replace("_","!_")+"%";
                var matches=new ArrayList<jakarta.persistence.criteria.Predicate>();
                for(String field:List.of("name","clinic","area","city"))matches.add(cb.like(cb.lower(root.get(field)),literal,'!'));
                var codes=catalog.specialties().entrySet().stream().filter(e->e.getValue().toLowerCase(Locale.ROOT).contains(word)).map(Map.Entry::getKey).toList();
                if(!codes.isEmpty())matches.add(root.get("specialty").in(codes));
                terms.add(cb.or(matches.toArray(jakarta.persistence.criteria.Predicate[]::new)));
            }
            return cb.and(terms.toArray(jakarta.persistence.criteria.Predicate[]::new));
        };
        var result=repository.findAll(filter,PageRequest.of(page,size,order.and(Sort.by("id"))));
        return new DoctorPage(result.map(DoctorResponse::from).getContent(),page,size,result.getTotalElements(),result.getTotalPages());
    }
    @Transactional @PreAuthorize("hasRole('ADMIN')")
    public DoctorResponse create(CreateDoctorRequest request){validateCatalog(request);return DoctorResponse.from(repository.saveAndFlush(new Doctor(request,Instant.now(clock))));}
    @Transactional @PreAuthorize("hasRole('ADMIN')")
    public DoctorResponse update(UUID id,UpdateDoctorRequest request){
        var d=active(id);
        if(d.getVersion()!=request.version())throw new ResponseStatusException(HttpStatus.CONFLICT,"Doctor changed; fetch the latest version");
        var fields=new CreateDoctorRequest(request.name(),request.specialty(),request.city(),request.area(),request.clinic(),request.qualifications(),request.experienceYears(),request.feeInRupees(),request.languages(),request.about(),request.color());
        validateCatalog(fields);d.update(fields,Instant.now(clock));repository.flush();return DoctorResponse.from(d);
    }
    @Transactional @PreAuthorize("hasRole('ADMIN')")
    public void deactivate(UUID id){
        var d=repository.findById(id).orElseThrow(()->new ResponseStatusException(HttpStatus.NOT_FOUND,"Doctor not found"));
        if(d.isActive()){d.deactivate(Instant.now(clock));repository.flush();}
    }
    private Doctor active(UUID id){return repository.findByIdAndActiveTrue(id).orElseThrow(()->new ResponseStatusException(HttpStatus.NOT_FOUND,"Doctor not found"));}
    private void validateCatalog(CreateDoctorRequest r){
        if(!catalog.specialties().containsKey(r.specialty()))bad("Unknown specialty");
        if(!catalog.cities().contains(r.city()))bad("Unknown city");
    }
    private void bad(String message){throw new ResponseStatusException(HttpStatus.BAD_REQUEST,message);}
}

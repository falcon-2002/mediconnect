package com.mediconnect.appointment;
import com.mediconnect.appointment.application.DirectoryClient;
import com.sun.net.httpserver.HttpServer;
import java.net.InetSocketAddress;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.Test;
import org.springframework.web.client.RestClient;
import org.springframework.web.server.ResponseStatusException;
import static org.assertj.core.api.Assertions.*;
class DirectoryClientTest {
 @Test void profileValidationAndErrorMapping() throws Exception {
  var server=HttpServer.create(new InetSocketAddress("127.0.0.1",0),0);
  var status=new java.util.concurrent.atomic.AtomicInteger(200);var payload=new AtomicReference<>("{\"active\":true,\"fullName\":\"Ignored\"}");var auth=new AtomicReference<String>();
  server.createContext("/",e->{auth.set(e.getRequestHeaders().getFirst("Authorization"));byte[] b=payload.get().getBytes(java.nio.charset.StandardCharsets.UTF_8);e.getResponseHeaders().set("Content-Type","application/json");e.sendResponseHeaders(status.get(),b.length);try(var out=e.getResponseBody()){out.write(b);}});server.start();
  try {
   String url="http://127.0.0.1:"+server.getAddress().getPort();var client=new DirectoryClient(RestClient.builder(),url,url);UUID id=UUID.randomUUID();
   client.patient(id,"test-only");assertThat(auth.get()).isEqualTo("Bearer test-only");client.doctor(id);assertThat(auth.get()).isNull();
   payload.set("{\"active\":false}");assertThatThrownBy(()->client.doctor(id)).isInstanceOfSatisfying(ResponseStatusException.class,e->assertThat(e.getStatusCode().value()).isEqualTo(409));
   for(int code:new int[]{401,403,404,500}){status.set(code);assertThatThrownBy(()->client.patient(id,"test-only")).isInstanceOfSatisfying(ResponseStatusException.class,e->assertThat(e.getStatusCode().value()).isEqualTo(code==500?503:code));}
  }finally{server.stop(0);}
 }
}

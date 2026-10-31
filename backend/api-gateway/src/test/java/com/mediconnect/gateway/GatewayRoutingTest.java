package com.mediconnect.gateway;

import com.sun.net.httpserver.HttpServer;
import java.net.*;
import java.net.http.*;
import java.nio.charset.StandardCharsets;
import org.junit.jupiter.api.*;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest(webEnvironment=SpringBootTest.WebEnvironment.RANDOM_PORT,
 properties={"eureka.client.enabled=false","spring.cloud.discovery.enabled=false"})
class GatewayRoutingTest {
    static final HttpServer downstream;
    static {
        try {
            downstream=HttpServer.create(new InetSocketAddress("127.0.0.1",0),0);
            downstream.createContext("/", exchange -> {
                String result=exchange.getRequestMethod()+" "+exchange.getRequestURI().getPath()+" "+
                        exchange.getRequestHeaders().getFirst("Authorization");
                byte[] bytes=result.getBytes(StandardCharsets.UTF_8);
                exchange.sendResponseHeaders(200,bytes.length);
                try(var out=exchange.getResponseBody()){out.write(bytes);}
            });
            downstream.start();
        } catch(Exception ex){throw new ExceptionInInitializerError(ex);}
    }
    @LocalServerPort int port;
    @DynamicPropertySource static void routes(DynamicPropertyRegistry properties){
        // Spring replaces whole lists across property sources: retain route IDs and predicates
        // from the real YAML while redirecting only destinations to this test server.
        var yaml=new org.springframework.beans.factory.config.YamlPropertiesFactoryBean();
        yaml.setResources(new org.springframework.core.io.ClassPathResource("application.yml"));
        yaml.getObject().forEach((key,value)->{
            if(key.toString().startsWith("spring.cloud.gateway.server.webmvc.routes"))
                properties.add(key.toString(),()->value);
        });
        for(int index=0;index<3;index++) properties.add(
            "spring.cloud.gateway.server.webmvc.routes["+index+"].uri",
            () -> "http://127.0.0.1:"+downstream.getAddress().getPort());
    }
    @AfterAll static void stop(){downstream.stop(0);}
    @Test void doctorRouteIsPublicAndPreservesPath() throws Exception {
        var request=HttpRequest.newBuilder(URI.create("http://127.0.0.1:"+port+"/api/doctors/catalog")).GET().build();
        var response=HttpClient.newHttpClient().send(request,HttpResponse.BodyHandlers.ofString());
        assertThat(response.statusCode()).isEqualTo(200);
        assertThat(response.body()).isEqualTo("GET /api/doctors/catalog null");
    }
    @Test void patientRoutePreservesBearerToken() throws Exception {
        var request=HttpRequest.newBuilder(URI.create("http://127.0.0.1:"+port+"/api/patients"))
                .header("Authorization","Bearer test-forwarding-only").GET().build();
        var response=HttpClient.newHttpClient().send(request,HttpResponse.BodyHandlers.ofString());
        assertThat(response.statusCode()).isEqualTo(200);
        assertThat(response.body()).isEqualTo("GET /api/patients Bearer test-forwarding-only");
    }
    @Test void authLoginRouteIsReachableWithoutToken() throws Exception {
        var request=HttpRequest.newBuilder(URI.create("http://127.0.0.1:"+port+"/api/auth/login"))
                .POST(HttpRequest.BodyPublishers.ofString("{}")).header("Content-Type","application/json").build();
        var response=HttpClient.newHttpClient().send(request,HttpResponse.BodyHandlers.ofString());
        assertThat(response.statusCode()).isEqualTo(200);
        assertThat(response.body()).isEqualTo("POST /api/auth/login null");
    }
}

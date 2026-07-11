FROM maven:3.9.9-eclipse-temurin-21 AS build
WORKDIR /workspace
COPY backend/pom.xml backend/mvnw backend/mvnw.cmd ./backend/
COPY backend/.mvn ./backend/.mvn
COPY backend/src ./backend/src
COPY backend/checkstyle.xml ./backend/checkstyle.xml
COPY database ./database
WORKDIR /workspace/backend
RUN ./mvnw -q -DskipTests package

FROM eclipse-temurin:21-jre
WORKDIR /app
COPY --from=build /workspace/backend/target/*.jar app.jar
EXPOSE 8080
ENTRYPOINT ["java", "-jar", "/app/app.jar"]

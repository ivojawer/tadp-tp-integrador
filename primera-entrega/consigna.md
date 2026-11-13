Plataforma de Logística y Rutas de Entrega para Comercio Local





Base de datos: Relacional (PostgreSQL) para gestionar el inventario, usuarios, vehículos, órdenes y tracking geográfico en tiempo real.



Modelo API: REST API para operaciones CRUD estándar (pedidos, clientes) combinada con endpoints WebSockets para la actualización en tiempo real de la ubicación de los repartidores.



Optimización con Microservicios: Desacoplar el "Motor de Optimización de Rutas" en un microservicio independiente (ej. en Python/Node) que procese las solicitudes de cálculo de itinerarios óptimos de forma asíncrona mediante colas de mensajes (como RabbitMQ o Redis Pub/Sub), evitando así la congestión de la base de datos principal durante picos de pedidos.



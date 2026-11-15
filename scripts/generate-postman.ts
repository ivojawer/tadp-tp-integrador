import * as fs from 'fs'
import * as path from 'path'
import { randomUUID } from 'crypto'

function createItemRequest(
  name: string,
  method: string,
  pathSegments: string[],
  queryParams: { key: string; value: string; description?: string }[] = [],
  bodyJson: any = null,
  testScript: string = '',
  description: string = '',
) {
  const urlObj: any = {
    raw: `{{baseUrl}}/${pathSegments.join('/')}${
      queryParams.length > 0 ? '?' + queryParams.map((q) => `${q.key}=${q.value}`).join('&') : ''
    }`,
    host: ['{{baseUrl}}'],
    path: pathSegments,
  }

  if (queryParams.length > 0) {
    urlObj.query = queryParams.map((q) => ({
      key: q.key,
      value: q.value,
      description: q.description || '',
    }))
  }

  const events: any[] = []
  if (testScript) {
    events.push({
      listen: 'test',
      script: {
        type: 'text/javascript',
        exec: testScript.split('\n'),
      },
    })
  }

  const request: any = {
    method,
    header: [
      {
        key: 'Accept',
        value: 'application/json',
        type: 'text',
      },
    ],
    url: urlObj,
    description,
  }

  if (bodyJson !== null) {
    request.header.push({
      key: 'Content-Type',
      value: 'application/json',
      type: 'text',
    })
    request.body = {
      mode: 'raw',
      raw: JSON.stringify(bodyJson, null, 2),
      options: {
        raw: {
          language: 'json',
        },
      },
    }
  }

  return {
    name,
    event: events,
    request,
    response: [],
  }
}

const collection = {
  info: {
    _postman_id: randomUUID(),
    name: 'Plataforma Logística - Órdenes e Inventario',
    description:
      'Colección completa de pruebas para la Plataforma de Logística y Rutas de Entrega.\n\nCubre todos los requerimientos y casos del Plan de Desarrollo de Órdenes (.nocommit/plan-ordenes.md):\n- Módulo Inventario: Consulta de stock agrupado por SKU (disponibles y reservados).\n- Ciclo de vida completo de órdenes: Pedida -> Lista -> Enviada -> Completada.\n- Enriquecimiento de órdenes con ItemsPedidos e Items físicos asignados con su estadoFisico.\n- Reserva automática de stock al crear orden (409 si stock insuficiente).\n- Actualización de estado físico de items en cada fase (Reservado -> Preparado -> Entregado).\n- Listado y filtrado de órdenes por estado.\n- Casos de validación, errores y reglas de dominio (400, 404, 409).',
    schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
  },
  variable: [
    {
      key: 'baseUrl',
      value: 'http://localhost:3000',
      type: 'string',
    },
    {
      key: 'ordenId',
      value: '1',
      type: 'string',
    },
    {
      key: 'ordenIdInvalida',
      value: '1',
      type: 'string',
    },
    {
      key: 'productoSku1',
      value: 'PROD-001',
      type: 'string',
    },
    {
      key: 'productoSku2',
      value: 'PROD-002',
      type: 'string',
    },
    {
      key: 'repartidorLegajo',
      value: 'REP-101',
      type: 'string',
    },
    {
      key: 'vehiculoId',
      value: '1',
      type: 'string',
    },
  ],
  item: [
    {
      name: '01 - Inventario',
      description: 'Consultas de inventario y stock físico de warehouse agrupado por SKU.',
      item: [
        createItemRequest(
          '1.1 Consultar Stock Agrupado por SKU (GET /inventario/items/estado)',
          'GET',
          ['inventario', 'items', 'estado'],
          [],
          null,
          `pm.test("Status code es 200 OK", function () {
    pm.response.to.have.status(200);
});

pm.test("Retorna un arreglo de SKUs con stock disponible y reservado", function () {
    const data = pm.response.json();
    pm.expect(data).to.be.an("array");
    if (data.length > 0) {
        pm.expect(data[0]).to.have.property("sku");
        pm.expect(data[0]).to.have.property("totalDisponibles");
        pm.expect(data[0]).to.have.property("totalReservados");
        pm.expect(data[0].totalDisponibles).to.be.a("number");
        pm.expect(data[0].totalReservados).to.be.a("number");
    }
});`,
          'Obtiene el estado de stock de todos los SKUs registrados en el warehouse, indicando cuántas unidades físicas están Disponibles y cuántas están Reservadas.',
        ),
        createItemRequest(
          '1.2 Consultar Inventario Endpoint Alternativo (GET /inventario)',
          'GET',
          ['inventario'],
          [],
          null,
          `pm.test("Status code es 200 OK", function () {
    pm.response.to.have.status(200);
});

pm.test("Respuesta es un array válido", function () {
    pm.expect(pm.response.json()).to.be.an("array");
});`,
          'Ruta alternativa alias configurada en el controlador de Inventario.',
        ),
      ],
    },
    {
      name: '02 - Ciclo de Vida Completo de Orden (Happy Path)',
      description:
        'Flujo E2E completo y ordenado del ciclo de vida de una orden: Creación con reserva de stock -> Preparación en depósito (Lista) -> Despacho en tránsito (Enviada) -> Entrega final (Completada).\n\nCada petición valida la respuesta y transiciones de estado de los items físicos asociados.',
      item: [
        createItemRequest(
          '2.1 Crear Orden [Pedida] con Reserva de Stock (POST /ordenes)',
          'POST',
          ['ordenes'],
          [],
          {
            clienteNombre: 'Carlos Gómez',
            clienteDireccion: 'Calle Falsa 123, CABA',
            items: [
              {
                productoSku: '{{productoSku1}}',
                cantidad: 2,
              },
              {
                productoSku: '{{productoSku2}}',
                cantidad: 1,
              },
            ],
          },
          `pm.test("Status code es 201 Created", function () {
    pm.response.to.have.status(201);
});

const data = pm.response.json();

pm.test("Estructura de la Orden creada en estado Pedida", function () {
    pm.expect(data).to.have.property("id");
    pm.expect(data.clienteNombre).to.eql("Carlos Gómez");
    pm.expect(data.clienteDireccion).to.eql("Calle Falsa 123, CABA");
    pm.expect(data.estado).to.eql("Pedida");
    pm.expect(data.fechaCompletada).to.be.null;
    pm.expect(data.repartidorLegajo).to.be.null;
    pm.expect(data.vehiculoId).to.be.null;
});

pm.test("ItemsPedidos creados con items físicos en estado Reservado", function () {
    pm.expect(data.itemsPedidos).to.be.an("array").with.lengthOf(2);
    
    // Verificar items físicos asignados
    data.itemsPedidos.forEach(itemPedido => {
        pm.expect(itemPedido.items).to.be.an("array").with.lengthOf(itemPedido.cantidad);
        itemPedido.items.forEach(itemFisico => {
            pm.expect(itemFisico.estadoFisico).to.eql("Reservado");
            pm.expect(itemFisico.ordenId).to.eql(data.id);
        });
    });
});

// Guardar ordenId para las siguientes etapas del flujo
pm.collectionVariables.set("ordenId", data.id);
console.log("Nueva orden creada con ID:", data.id);`,
          'Crea una nueva orden de pedido y reserva atómicamente los items físicos disponibles en el warehouse cambiando su estado físico a "Reservado". Setea automáticamente la variable {{ordenId}}.',
        ),
        createItemRequest(
          '2.2 Obtener Detalle de Orden en estado Pedida (GET /ordenes/{{ordenId}})',
          'GET',
          ['ordenes', '{{ordenId}}'],
          [],
          null,
          `pm.test("Status code es 200 OK", function () {
    pm.response.to.have.status(200);
});

const data = pm.response.json();
const expectedId = Number(pm.collectionVariables.get("ordenId"));

pm.test("Detalle de la orden Pedida contiene líneas y items físicos Reservados", function () {
    pm.expect(data.id).to.eql(expectedId);
    pm.expect(data.estado).to.eql("Pedida");
    pm.expect(data.itemsPedidos).to.be.an("array").with.lengthOf(2);

    data.itemsPedidos.forEach(itemPedido => {
        pm.expect(itemPedido.items).to.be.an("array").with.lengthOf(itemPedido.cantidad);
        itemPedido.items.forEach(itemFisico => {
            pm.expect(itemFisico.estadoFisico).to.eql("Reservado");
        });
    });
});`,
          'Recupera la orden enriquecida con sus líneas de pedido e items físicos en estado Reservado.',
        ),
        createItemRequest(
          '2.3 Verificar Inventario tras Reserva (GET /inventario/items/estado)',
          'GET',
          ['inventario', 'items', 'estado'],
          [],
          null,
          `pm.test("Status code es 200 OK", function () {
    pm.response.to.have.status(200);
});

const data = pm.response.json();
pm.test("Los SKUs tienen unidades en totalReservados > 0", function () {
    const prod1 = data.find(p => p.sku === pm.collectionVariables.get("productoSku1"));
    if (prod1) {
        pm.expect(prod1.totalReservados).to.be.at.least(2);
    }
});`,
          'Verifica que el inventario global refleja las unidades reservadas por la orden recién creada.',
        ),
        createItemRequest(
          '2.4 Transición a Lista - Preparar Items (PATCH /ordenes/{{ordenId}}/estado)',
          'PATCH',
          ['ordenes', '{{ordenId}}', 'estado'],
          [],
          {
            nuevoEstado: 'Lista',
          },
          `pm.test("Status code es 200 OK", function () {
    pm.response.to.have.status(200);
});

const data = pm.response.json();

pm.test("Orden cambió a estado Lista", function () {
    pm.expect(data.estado).to.eql("Lista");
});

pm.test("Items físicos pasaron atómicamente a Preparado", function () {
    pm.expect(data.itemsPedidos).to.be.an("array");
    data.itemsPedidos.forEach(itemPedido => {
        itemPedido.items.forEach(itemFisico => {
            pm.expect(itemFisico.estadoFisico).to.eql("Preparado");
        });
    });
});`,
          'Avanza la orden a estado "Lista". En este paso, el personal del warehouse prepara el pedido y los items físicos pasan de "Reservado" a "Preparado".',
        ),
        createItemRequest(
          '2.5 Obtener Detalle de Orden en estado Lista (GET /ordenes/{{ordenId}})',
          'GET',
          ['ordenes', '{{ordenId}}'],
          [],
          null,
          `pm.test("Status code es 200 OK", function () {
    pm.response.to.have.status(200);
});

const data = pm.response.json();
pm.test("Estado es Lista y items físicos están Preparados", function () {
    pm.expect(data.estado).to.eql("Lista");
    data.itemsPedidos.forEach(itemPedido => {
        itemPedido.items.forEach(itemFisico => {
            pm.expect(itemFisico.estadoFisico).to.eql("Preparado");
        });
    });
});`,
          'Verifica que la consulta GET devuelve la orden en estado "Lista" con sus items en "Preparado".',
        ),
        createItemRequest(
          '2.6 Transición a Enviada - Despacho con Repartidor y Vehículo (PATCH /ordenes/{{ordenId}}/estado)',
          'PATCH',
          ['ordenes', '{{ordenId}}', 'estado'],
          [],
          {
            nuevoEstado: 'Enviada',
            repartidorLegajo: '{{repartidorLegajo}}',
            vehiculoId: 1,
          },
          `pm.test("Status code es 200 OK", function () {
    pm.response.to.have.status(200);
});

const data = pm.response.json();

pm.test("Orden cambió a estado Enviada con asignaciones", function () {
    pm.expect(data.estado).to.eql("Enviada");
    pm.expect(data.repartidorLegajo).to.eql(pm.collectionVariables.get("repartidorLegajo"));
    pm.expect(data.vehiculoId).to.eql(1);
});

pm.test("Items físicos se mantienen en estado Preparado (en tránsito)", function () {
    data.itemsPedidos.forEach(itemPedido => {
        itemPedido.items.forEach(itemFisico => {
            pm.expect(itemFisico.estadoFisico).to.eql("Preparado");
        });
    });
});`,
          'Avanza la orden de "Lista" a "Enviada", asignando el legajo del repartidor y el ID del vehículo. Los items físicos continúan en "Preparado" ya que salieron del depósito.',
        ),
        createItemRequest(
          '2.7 Obtener Detalle de Orden en estado Enviada (GET /ordenes/{{ordenId}})',
          'GET',
          ['ordenes', '{{ordenId}}'],
          [],
          null,
          `pm.test("Status code es 200 OK", function () {
    pm.response.to.have.status(200);
});

const data = pm.response.json();
pm.test("Estado es Enviada con repartidor y vehículo asignados", function () {
    pm.expect(data.estado).to.eql("Enviada");
    pm.expect(data.repartidorLegajo).to.eql(pm.collectionVariables.get("repartidorLegajo"));
    pm.expect(data.vehiculoId).to.eql(1);
});`,
          'Verifica los datos de la orden despachada en tránsito.',
        ),
        createItemRequest(
          '2.8 Transición a Completada - Entrega Final (PATCH /ordenes/{{ordenId}}/estado)',
          'PATCH',
          ['ordenes', '{{ordenId}}', 'estado'],
          [],
          {
            nuevoEstado: 'Completada',
          },
          `pm.test("Status code es 200 OK", function () {
    pm.response.to.have.status(200);
});

const data = pm.response.json();

pm.test("Orden cambió a Completada con fechaCompletada registrada", function () {
    pm.expect(data.estado).to.eql("Completada");
    pm.expect(data.fechaCompletada).to.not.be.null;
    pm.expect(new Date(data.fechaCompletada).getTime()).to.be.a("number");
});

pm.test("Items físicos pasaron atómicamente a estado Entregado", function () {
    data.itemsPedidos.forEach(itemPedido => {
        itemPedido.items.forEach(itemFisico => {
            pm.expect(itemFisico.estadoFisico).to.eql("Entregado");
        });
    });
});`,
          'Finaliza la entrega de la orden. Se establece la fecha de completada y los items físicos pasan a estado final "Entregado".',
        ),
        createItemRequest(
          '2.9 Obtener Detalle de Orden en estado Completada (GET /ordenes/{{ordenId}})',
          'GET',
          ['ordenes', '{{ordenId}}'],
          [],
          null,
          `pm.test("Status code es 200 OK", function () {
    pm.response.to.have.status(200);
});

const data = pm.response.json();
pm.test("Orden Completada es inmutable con fecha y items Entregados", function () {
    pm.expect(data.estado).to.eql("Completada");
    pm.expect(data.fechaCompletada).to.not.be.null;
    data.itemsPedidos.forEach(itemPedido => {
        itemPedido.items.forEach(itemFisico => {
            pm.expect(itemFisico.estadoFisico).to.eql("Entregado");
        });
    });
});`,
          'Verifica el estado final de la orden completada.',
        ),
      ],
    },
    {
      name: '03 - Listado y Filtros (GET /ordenes)',
      description:
        'Endpoints para listar órdenes con soporte para filtros por estado (Pedida, Lista, Enviada, Completada).',
      item: [
        createItemRequest(
          '3.1 Listar Todas las Órdenes (GET /ordenes)',
          'GET',
          ['ordenes'],
          [],
          null,
          `pm.test("Status code es 200 OK", function () {
    pm.response.to.have.status(200);
});

const data = pm.response.json();
pm.test("Retorna arreglo de órdenes con sus líneas de pedido", function () {
    pm.expect(data).to.be.an("array");
    if (data.length > 0) {
        pm.expect(data[0]).to.have.property("id");
        pm.expect(data[0]).to.have.property("clienteNombre");
        pm.expect(data[0]).to.have.property("estado");
        pm.expect(data[0]).to.have.property("itemsPedidos");
    }
});`,
          'Recupera todas las órdenes existentes con sus itemsPedidos.',
        ),
        createItemRequest(
          '3.2 Filtrar Órdenes por estado Pedida (GET /ordenes?estado=Pedida)',
          'GET',
          ['ordenes'],
          [{ key: 'estado', value: 'Pedida', description: 'Filtro por estado Pedida' }],
          null,
          `pm.test("Status code es 200 OK", function () {
    pm.response.to.have.status(200);
});

const data = pm.response.json();
pm.test("Todas las órdenes retornadas tienen estado Pedida", function () {
    pm.expect(data).to.be.an("array");
    data.forEach(orden => {
        pm.expect(orden.estado).to.eql("Pedida");
    });
});`,
          'Lista únicamente las órdenes que se encuentran pendientes de preparación (estado Pedida).',
        ),
        createItemRequest(
          '3.3 Filtrar Órdenes por estado Lista (GET /ordenes?estado=Lista)',
          'GET',
          ['ordenes'],
          [{ key: 'estado', value: 'Lista', description: 'Filtro por estado Lista' }],
          null,
          `pm.test("Status code es 200 OK", function () {
    pm.response.to.have.status(200);
});

const data = pm.response.json();
pm.test("Todas las órdenes retornadas tienen estado Lista", function () {
    pm.expect(data).to.be.an("array");
    data.forEach(orden => {
        pm.expect(orden.estado).to.eql("Lista");
    });
});`,
          'Lista las órdenes preparadas en warehouse listas para ser asignadas a un vehículo.',
        ),
        createItemRequest(
          '3.4 Filtrar Órdenes por estado Enviada (GET /ordenes?estado=Enviada)',
          'GET',
          ['ordenes'],
          [{ key: 'estado', value: 'Enviada', description: 'Filtro por estado Enviada' }],
          null,
          `pm.test("Status code es 200 OK", function () {
    pm.response.to.have.status(200);
});

const data = pm.response.json();
pm.test("Todas las órdenes retornadas tienen estado Enviada", function () {
    pm.expect(data).to.be.an("array");
    data.forEach(orden => {
        pm.expect(orden.estado).to.eql("Enviada");
    });
});`,
          'Lista las órdenes actualmente en tránsito.',
        ),
        createItemRequest(
          '3.5 Filtrar Órdenes por estado Completada (GET /ordenes?estado=Completada)',
          'GET',
          ['ordenes'],
          [{ key: 'estado', value: 'Completada', description: 'Filtro por estado Completada' }],
          null,
          `pm.test("Status code es 200 OK", function () {
    pm.response.to.have.status(200);
});

const data = pm.response.json();
pm.test("Todas las órdenes retornadas tienen estado Completada", function () {
    pm.expect(data).to.be.an("array");
    data.forEach(orden => {
        pm.expect(orden.estado).to.eql("Completada");
    });
});`,
          'Lista las órdenes que ya fueron entregadas con éxito.',
        ),
        createItemRequest(
          '3.6 Error: Filtrar con Estado Inválido (GET /ordenes?estado=EstadoFalso)',
          'GET',
          ['ordenes'],
          [{ key: 'estado', value: 'EstadoFalso', description: 'Estado inexistente' }],
          null,
          `pm.test("Status code es 400 Bad Request", function () {
    pm.response.to.have.status(400);
});`,
          'Verifica que el pipe de validación rechaza estados desconocidos que no pertenezcan al enum EstadoOrden.',
        ),
      ],
    },
    {
      name: '04 - Validaciones y Casos de Error (Negative Tests)',
      description:
        'Pruebas de caminos no felices (negative tests) que validan el rechazo de peticiones inválidas, control de stock insuficiente, transiciones prohibidas en la máquina de estados y recursos inexistentes.',
      item: [
        createItemRequest(
          '4.1 Error: Crear Orden con Stock Insuficiente (POST /ordenes)',
          'POST',
          ['ordenes'],
          [],
          {
            clienteNombre: 'Cliente Excede Stock',
            clienteDireccion: 'Calle Sin Stock 999',
            items: [
              {
                productoSku: '{{productoSku1}}',
                cantidad: 99999,
              },
            ],
          },
          `pm.test("Status code es 409 Conflict", function () {
    pm.response.to.have.status(409);
});

const data = pm.response.json();
pm.test("Mensaje de error indica stock insuficiente con el SKU solicitado", function () {
    const msg = data.message || "";
    pm.expect(msg).to.include("Stock insuficiente");
    pm.expect(msg).to.include(pm.collectionVariables.get("productoSku1"));
});`,
          'Intenta crear una orden con una cantidad superior a la disponible en el warehouse. Debe ser rechazada con 409 Conflict.',
        ),
        createItemRequest(
          '4.2 Error: Crear Orden con Lista de Items Vacía (POST /ordenes)',
          'POST',
          ['ordenes'],
          [],
          {
            clienteNombre: 'Cliente Sin Items',
            clienteDireccion: 'Calle Vacia 123',
            items: [],
          },
          `pm.test("Status code es 400 Bad Request", function () {
    pm.response.to.have.status(400);
});`,
          'Intenta crear una orden con items vacíos. El controlador y class-validator deben retornar 400 Bad Request.',
        ),
        createItemRequest(
          '4.3 Error: Crear Orden sin Campos Requeridos (POST /ordenes)',
          'POST',
          ['ordenes'],
          [],
          {},
          `pm.test("Status code es 400 Bad Request", function () {
    pm.response.to.have.status(400);
});`,
          'Valida que el request body sin propiedades obligatorias es rechazado por el ValidationPipe.',
        ),
        createItemRequest(
          '4.4 Error: Crear Orden con Cantidad Negativa o Cero (POST /ordenes)',
          'POST',
          ['ordenes'],
          [],
          {
            clienteNombre: 'Cliente Cantidad Invalida',
            clienteDireccion: 'Calle Prueba 123',
            items: [
              {
                productoSku: '{{productoSku1}}',
                cantidad: -5,
              },
            ],
          },
          `pm.test("Status code es 400 Bad Request", function () {
    pm.response.to.have.status(400);
});`,
          'Valida que no se permitan cantidades no positivas en las líneas de pedido.',
        ),
        createItemRequest(
          '4.5 Error: Consultar Orden Inexistente (GET /ordenes/999999)',
          'GET',
          ['ordenes', '999999'],
          [],
          null,
          `pm.test("Status code es 404 Not Found", function () {
    pm.response.to.have.status(404);
});`,
          'Consulta un ID de orden que no existe en el sistema. Debe responder con 404 Not Found.',
        ),
        createItemRequest(
          '4.6 Error: Consultar Orden con ID Alfanumérico (GET /ordenes/abc)',
          'GET',
          ['ordenes', 'abc'],
          [],
          null,
          `pm.test("Status code es 400 Bad Request", function () {
    pm.response.to.have.status(400);
});`,
          'Valida el ParseIntPipe en el parámetro :id del endpoint.',
        ),
        createItemRequest(
          '4.7 Setup Auxiliar: Crear Orden para Probar Transiciones Inválidas (POST /ordenes)',
          'POST',
          ['ordenes'],
          [],
          {
            clienteNombre: 'Prueba Transiciones Inválidas',
            clienteDireccion: 'Calle de Prueba 789',
            items: [
              {
                productoSku: '{{productoSku1}}',
                cantidad: 1,
              },
            ],
          },
          `pm.test("Status code es 201 Created", function () {
    pm.response.to.have.status(201);
});

const data = pm.response.json();
pm.collectionVariables.set("ordenIdInvalida", data.id);
console.log("Orden auxiliar para transiciones inválidas creada:", data.id);`,
          'Crea una orden en estado Pedida para verificar que no se pueden realizar transiciones prohibidas por la máquina de estados.',
        ),
        createItemRequest(
          '4.8 Error: Transición Inválida Directa Pedida -> Enviada (PATCH /ordenes/{{ordenIdInvalida}}/estado)',
          'PATCH',
          ['ordenes', '{{ordenIdInvalida}}', 'estado'],
          [],
          {
            nuevoEstado: 'Enviada',
            repartidorLegajo: '{{repartidorLegajo}}',
            vehiculoId: 1,
          },
          `pm.test("Status code es 400 Bad Request", function () {
    pm.response.to.have.status(400);
});

const data = pm.response.json();
pm.test("Mensaje indica regla de negocio: Pedida solo puede pasar a Lista", function () {
    const msg = data.message || "";
    pm.expect(msg).to.include("solo puede pasar a Lista");
});`,
          'No se puede saltear la preparación en warehouse: una orden Pedida no puede pasar directo a Enviada.',
        ),
        createItemRequest(
          '4.9 Transición Auxiliar Válida a Lista (PATCH /ordenes/{{ordenIdInvalida}}/estado)',
          'PATCH',
          ['ordenes', '{{ordenIdInvalida}}', 'estado'],
          [],
          {
            nuevoEstado: 'Lista',
          },
          `pm.test("Status code es 200 OK", function () {
    pm.response.to.have.status(200);
});`,
          'Pasa la orden auxiliar a Lista para probar las siguientes validaciones sobre dicho estado.',
        ),
        createItemRequest(
          '4.10 Error: Transición Lista -> Enviada sin Repartidor ni Vehículo (PATCH /ordenes/{{ordenIdInvalida}}/estado)',
          'PATCH',
          ['ordenes', '{{ordenIdInvalida}}', 'estado'],
          [],
          {
            nuevoEstado: 'Enviada',
          },
          `pm.test("Status code es 400 Bad Request", function () {
    pm.response.to.have.status(400);
});

const data = pm.response.json();
pm.test("Mensaje indica requerimiento de repartidor y vehículo", function () {
    const msg = data.message || "";
    pm.expect(msg).to.include("repartidorLegajo y vehiculoId");
});`,
          'Al pasar a Enviada es obligatorio asignar repartidor y vehículo de transporte.',
        ),
        createItemRequest(
          '4.11 Error: Transición Inválida Directa Lista -> Completada (PATCH /ordenes/{{ordenIdInvalida}}/estado)',
          'PATCH',
          ['ordenes', '{{ordenIdInvalida}}', 'estado'],
          [],
          {
            nuevoEstado: 'Completada',
          },
          `pm.test("Status code es 400 Bad Request", function () {
    pm.response.to.have.status(400);
});

const data = pm.response.json();
pm.test("Mensaje indica que Lista solo puede pasar a Enviada", function () {
    const msg = data.message || "";
    pm.expect(msg).to.include("solo puede pasar a Enviada");
});`,
          'Una orden no puede completarse sin haber sido enviada con un repartidor.',
        ),
        createItemRequest(
          '4.12 Error: Modificar Estado de una Orden ya Completada (PATCH /ordenes/{{ordenId}}/estado)',
          'PATCH',
          ['ordenes', '{{ordenId}}', 'estado'],
          [],
          {
            nuevoEstado: 'Pedida',
          },
          `pm.test("Status code es 409 Conflict", function () {
    pm.response.to.have.status(409);
});

const data = pm.response.json();
pm.test("Mensaje indica que no se puede cambiar el estado de orden completada", function () {
    const msg = data.message || "";
    pm.expect(msg).to.include("No se puede cambiar el estado de una orden ya completada");
});`,
          'El estado Completada es final e inmutable según las reglas del State Pattern.',
        ),
        createItemRequest(
          '4.13 Error: Cambiar Estado de Orden Inexistente (PATCH /ordenes/999999/estado)',
          'PATCH',
          ['ordenes', '999999', 'estado'],
          [],
          {
            nuevoEstado: 'Lista',
          },
          `pm.test("Status code es 404 Not Found", function () {
    pm.response.to.have.status(404);
});`,
          'Intenta actualizar el estado de una orden que no existe. Retorna 404 Not Found.',
        ),
      ],
    },
  ],
}

const environment = {
  id: randomUUID(),
  name: 'Logistica - Local Development',
  values: [
    {
      key: 'baseUrl',
      value: 'http://localhost:3000',
      type: 'default',
      enabled: true,
    },
    {
      key: 'ordenId',
      value: '1',
      type: 'default',
      enabled: true,
    },
    {
      key: 'ordenIdInvalida',
      value: '1',
      type: 'default',
      enabled: true,
    },
    {
      key: 'productoSku1',
      value: 'PROD-001',
      type: 'default',
      enabled: true,
    },
    {
      key: 'productoSku2',
      value: 'PROD-002',
      type: 'default',
      enabled: true,
    },
    {
      key: 'repartidorLegajo',
      value: 'REP-101',
      type: 'default',
      enabled: true,
    },
    {
      key: 'vehiculoId',
      value: '1',
      type: 'default',
      enabled: true,
    },
  ],
  _postman_variable_scope: 'environment',
}

const postmanDir = path.resolve(__dirname, '../postman')
if (!fs.existsSync(postmanDir)) {
  fs.mkdirSync(postmanDir, { recursive: true })
}

const collectionPath = path.join(postmanDir, 'Logistica_Ordenes_Inventario.postman_collection.json')
fs.writeFileSync(collectionPath, JSON.stringify(collection, null, 2), 'utf-8')
console.log(`✅ Colección de Postman generada en: ${collectionPath}`)

const envPath = path.join(postmanDir, 'Logistica_Local.postman_environment.json')
fs.writeFileSync(envPath, JSON.stringify(environment, null, 2), 'utf-8')
console.log(`✅ Entorno de Postman generado en: ${envPath}`)

import {
  BadRequestException,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common'
import { Test, TestingModule } from '@nestjs/testing'
import { VehiculosController } from '../controllers/vehiculos.controller'
import { CreateVehiculoDto } from '../dto/create-vehiculo.dto'
import { Vehiculo } from '../entities/vehiculo.entity'
import { VehiculosService } from '../services/vehiculos.service'

describe('VehiculosController', () => {
  let controller: VehiculosController
  let service: jest.Mocked<Partial<VehiculosService>>

  const mockVehiculo: Vehiculo = {
    id: 1,
    modelo: 'Renault Kangoo',
    capacidadVolumen: 3.0,
    capacidadPeso: 650.0,
  }

  beforeEach(async () => {
    service = {
      findAll: jest.fn(),
      findById: jest.fn(),
      create: jest.fn(),
    }

    const module: TestingModule = await Test.createTestingModule({
      controllers: [VehiculosController],
      providers: [
        {
          provide: VehiculosService,
          useValue: service,
        },
      ],
    }).compile()

    controller = module.get<VehiculosController>(VehiculosController)
  })

  describe('findAll', () => {
    it('retorna 200 y la lista de vehículos', async () => {
      ;(service.findAll as jest.Mock).mockResolvedValue([mockVehiculo])

      const result = await controller.findAll()

      expect(result).toEqual([mockVehiculo])
      expect(service.findAll).toHaveBeenCalledTimes(1)
    })

    it('captura errores inesperados y lanza InternalServerErrorException', async () => {
      ;(service.findAll as jest.Mock).mockRejectedValue(new Error('Fallo de base de datos'))

      await expect(controller.findAll()).rejects.toThrow(InternalServerErrorException)
    })
  })

  describe('findById', () => {
    it('retorna 200 y el vehículo correspondiente si existe', async () => {
      ;(service.findById as jest.Mock).mockResolvedValue(mockVehiculo)

      const result = await controller.findById(1)

      expect(result).toEqual(mockVehiculo)
      expect(service.findById).toHaveBeenCalledWith(1)
    })

    it('propaga NotFoundException (404) si el vehículo no existe', async () => {
      ;(service.findById as jest.Mock).mockRejectedValue(
        new NotFoundException('El vehículo con id 999 no fue encontrado'),
      )

      await expect(controller.findById(999)).rejects.toThrow(NotFoundException)
    })

    it('captura errores inesperados y lanza InternalServerErrorException', async () => {
      ;(service.findById as jest.Mock).mockRejectedValue(new Error('Fallo inesperado'))

      await expect(controller.findById(1)).rejects.toThrow(InternalServerErrorException)
    })
  })

  describe('create', () => {
    const validDto: CreateVehiculoDto = {
      modelo: 'Renault Kangoo',
      capacidadVolumen: 3.0,
      capacidadPeso: 650.0,
    }

    it('retorna 201 y el vehículo creado con body válido', async () => {
      ;(service.create as jest.Mock).mockResolvedValue(mockVehiculo)

      const result = await controller.create(validDto)

      expect(result).toEqual(mockVehiculo)
      expect(service.create).toHaveBeenCalledWith(validDto)
    })

    it('lanza BadRequestException si el modelo está vacío', async () => {
      const invalidDto: CreateVehiculoDto = {
        modelo: '',
        capacidadVolumen: 3.0,
        capacidadPeso: 650.0,
      }

      await expect(controller.create(invalidDto)).rejects.toThrow(BadRequestException)
    })

    it('lanza BadRequestException si la capacidad de volumen es menor o igual a cero', async () => {
      const invalidDto: CreateVehiculoDto = {
        modelo: 'Sprinter',
        capacidadVolumen: 0,
        capacidadPeso: 650.0,
      }

      await expect(controller.create(invalidDto)).rejects.toThrow(BadRequestException)
    })

    it('lanza BadRequestException si la capacidad de peso es menor o igual a cero', async () => {
      const invalidDto: CreateVehiculoDto = {
        modelo: 'Sprinter',
        capacidadVolumen: 5.0,
        capacidadPeso: -10,
      }

      await expect(controller.create(invalidDto)).rejects.toThrow(BadRequestException)
    })

    it('captura errores inesperados y lanza InternalServerErrorException', async () => {
      ;(service.create as jest.Mock).mockRejectedValue(new Error('Fallo al insertar'))

      await expect(controller.create(validDto)).rejects.toThrow(InternalServerErrorException)
    })
  })
})

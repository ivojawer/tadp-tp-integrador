import { NotFoundException } from '@nestjs/common'
import { Test, TestingModule } from '@nestjs/testing'
import { Vehiculo } from '../entities/vehiculo.entity'
import { IVehiculosRepository, VEHICULOS_REPOSITORY } from '../repositories/vehiculos.repository'
import { VehiculosService } from '../services/vehiculos.service'

describe('VehiculosService', () => {
  let service: VehiculosService
  let repository: jest.Mocked<IVehiculosRepository>

  const mockVehiculo: Vehiculo = {
    id: 1,
    modelo: 'Renault Kangoo',
    capacidadVolumen: 3.0,
    capacidadPeso: 650.0,
  }

  beforeEach(async () => {
    const mockRepo: jest.Mocked<IVehiculosRepository> = {
      findAll: jest.fn(),
      findById: jest.fn(),
      create: jest.fn(),
    }

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VehiculosService,
        {
          provide: VEHICULOS_REPOSITORY,
          useValue: mockRepo,
        },
      ],
    }).compile()

    service = module.get<VehiculosService>(VehiculosService)
    repository = module.get(VEHICULOS_REPOSITORY)
  })

  describe('findAll', () => {
    it('delega al repository y retorna la lista de vehículos', async () => {
      repository.findAll.mockResolvedValue([mockVehiculo])

      const result = await service.findAll()

      expect(result).toEqual([mockVehiculo])
      expect(repository.findAll).toHaveBeenCalledTimes(1)
    })
  })

  describe('findById', () => {
    it('retorna el vehículo cuando existe', async () => {
      repository.findById.mockResolvedValue(mockVehiculo)

      const result = await service.findById(1)

      expect(result).toEqual(mockVehiculo)
      expect(repository.findById).toHaveBeenCalledWith(1)
    })

    it('lanza NotFoundException si el vehículo no existe', async () => {
      repository.findById.mockResolvedValue(null)

      await expect(service.findById(999)).rejects.toThrow(NotFoundException)
      expect(repository.findById).toHaveBeenCalledWith(999)
    })
  })

  describe('create', () => {
    it('delega al repository la creación y retorna el nuevo vehículo', async () => {
      const dto = {
        modelo: 'Renault Kangoo',
        capacidadVolumen: 3.0,
        capacidadPeso: 650.0,
      }
      repository.create.mockResolvedValue(mockVehiculo)

      const result = await service.create(dto)

      expect(result).toEqual(mockVehiculo)
      expect(repository.create).toHaveBeenCalledWith({
        modelo: 'Renault Kangoo',
        capacidadVolumen: 3.0,
        capacidadPeso: 650.0,
      })
    })
  })
})

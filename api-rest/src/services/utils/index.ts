import { CalculationType } from '../constants';
import { CreateFixedServiceDto } from '../dto/create-fixed-service.dto';

export const validateFixedServices = (
  services: CreateFixedServiceDto[],
): void => {
  const validateService = (service: CreateFixedServiceDto) => {
    // validate precio fijo
    if (service.calculation_type === CalculationType.FIJO) {
      if (
        service.price === null ||
        service.price === undefined ||
        service.price < 0
      ) {
        throw new Error('Price is required and must be greater than 0');
      }
    }
    // validate precio variable con limites
    else if (
      service.calculation_type === CalculationType.VARIABLE_CON_LIMITES
    ) {
      if (
        // validate min price
        service.min_price === null ||
        service.min_price === undefined ||
        service.min_price < 0 ||
        // validate max price
        service.max_price === null ||
        service.max_price === undefined ||
        service.max_price < 0
      ) {
        throw new Error(
          'Min price and max price are required and must be greater than 0',
        );
      }
      // validate min price is smaller than max price
      else if (service.min_price > service.max_price) {
        throw new Error('Min price must be smaller than max price');
      }
      // price must be null or undefined
      else if (service.price !== null && service.price !== undefined) {
        throw new Error('Price must be null or undefined');
      }
      // validate price per person
      else if (
        service.price_per_person === null ||
        service.price_per_person === undefined ||
        service.price_per_person < 0
      ) {
        throw new Error(
          'Price per person is required and must be greater than 0',
        );
      }
    }
    // Validate fijo + variable
    else if (service.calculation_type === CalculationType.FIJO_VARIABLE) {
      if (
        // validate price
        service.price === null ||
        service.price === undefined ||
        service.price < 0
      ) {
        throw new Error('Price is required and must be greater than 0');
      }
      // validate price per person
      else if (
        service.price_per_person === null ||
        service.price_per_person === undefined ||
        service.price_per_person < 0
      ) {
        throw new Error(
          'Price per person is required and must be greater than 0',
        );
      }
    }
  };

  services.forEach((service) => {
    validateService(service);
  });
};

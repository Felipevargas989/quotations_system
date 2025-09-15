import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { Company } from 'src/companies/entities/company.entity';
import { User } from './entities/user.entity';
import { UsersRepository } from './users.repository';

@Injectable()
export class UsersService {
  constructor(
    private readonly usersRepository: UsersRepository,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(UsersService.name);
  }

  // create(createUserDto: CreateUserDto) {
  //   return 'This action adds a new user';
  // }

  findAll(companyId: Company['id']) {
    this.logger.info(`findAll users with companyId ${companyId}`);
    return this.usersRepository.findAll(companyId);
  }

  findOne(id: User['id']) {
    return this.usersRepository.findOne(id);
  }

  // update(id: number, updateUserDto: UpdateUserDto) {
  //   return `This action updates a #${id} user`;
  // }

  // remove(id: number) {
  //   return `This action removes a #${id} user`;
  // }
}

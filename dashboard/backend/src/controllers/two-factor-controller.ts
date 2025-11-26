import { Request, Response } from 'express';

import { TwoFactorService } from '../services/two-factor-service';
import { HttpError } from '../utils/http-error';

/**
 * 2FA 相关控制器，包含状态查询、验证与好友担保接口
 */
export class TwoFactorController {
  constructor(private readonly twoFactorService: TwoFactorService) {}

  getStatus = async (req: Request, res: Response): Promise<void> => {
    const { synapseUserId } = req.params;
    if (!synapseUserId) {
      throw new HttpError(400, '缺少 synapseUserId');
    }

    const status = await this.twoFactorService.getStatusForSynapseUser(synapseUserId);
    res.json(status);
  };

  verifyFriend = async (req: Request, res: Response): Promise<void> => {
    const result = await this.twoFactorService.verifyFriend({
      verifierMatrixId: req.body.verifier,
      targetMatrixId: req.body.target,
      verificationHash: req.body.hash,
    });
    res.json(result);
  };
}

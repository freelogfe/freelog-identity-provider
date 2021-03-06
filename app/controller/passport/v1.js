/**
 * Created by yuliang on 2017/10/19.
 */

'use strict'

const lodash = require('lodash')
const moment = require('moment')
const Controller = require('egg').Controller;
const jwtHelper = require('egg-freelog-base/app/extend/helper/jwt_helper')
const {ArgumentError, AuthenticationError} = require('egg-freelog-base/error')

module.exports = class PassPortController extends Controller {

    constructor({app}) {
        super(...arguments)
        this.userProvider = app.dal.userProvider
    }

    /**
     * 登录接口
     * @returns {Promise.<void>}
     */
    async login(ctx) {

        const loginName = ctx.checkBody("loginName").exist().notEmpty().value
        const password = ctx.checkBody('password').exist().len(6, 24).notEmpty().value
        const isRemember = ctx.checkBody("isRemember").optional().toInt().in([0, 1]).default(0).value
        const returnUrl = ctx.checkBody("returnUrl").optional().value
        const jwtType = ctx.checkBody('jwtType').optional().in(['cookie', 'header']).default('cookie').value
        ctx.allowContentType({type: 'json'}).validateParams()

        const condition = {}
        const {helper, config, cookies} = ctx
        if (helper.commonRegex.mobile86.test(loginName)) {
            condition.mobile = loginName
        } else if (helper.commonRegex.email.test(loginName)) {
            condition.email = loginName
        } else if (helper.commonRegex.username.test(loginName)) {
            condition.username = loginName
        } else {
            throw new ArgumentError({msg: ctx.gettext('login-name-format-validate-failed'), data: {loginName}})
        }

        const userInfo = await this.userProvider.findOne(condition)
        if (!userInfo || helper.generatePassword(userInfo.salt, password) !== userInfo.password) {
            throw new AuthenticationError(ctx.gettext('login-name-or-password-validate-failed'))
        }

        const {publicKey, privateKey, cookieName} = config.jwtAuth
        const payLoad = Object.assign(lodash.pick(userInfo, ['userId', 'username', 'userType', 'mobile', 'email']), generateJwtPayload(userInfo.userId, userInfo.tokenSn))

        const jwtStr = new jwtHelper(publicKey, privateKey).createJwt(payLoad, 1296000)

        if (jwtType === 'cookie') {
            const cookieOptions = {
                httpOnly: false,
                domain: config.domain,
                overwrite: true,
                signed: false,
                expires: isRemember ? moment().add(7, 'days').toDate() : undefined
            }
            cookies.set(cookieName, jwtStr, cookieOptions)
            cookies.set('uid', userInfo.userId.toString(), cookieOptions)
        } else {
            ctx.set('Authorization', `Bearer ${jwtStr}`)
        }

        returnUrl ? ctx.redirect(returnUrl) : ctx.success(userInfo)
    }

    /**
     * 退出登陆(清理cookie)
     */
    async logout(ctx) {

        const returnUrl = ctx.checkQuery("returnUrl").optional().decodeURIComponent().isUrl().value
        ctx.validateParams()

        ctx.cookies.set(ctx.config.jwtAuth.cookieName, null, {domain: ctx.config.domain})
        ctx.cookies.set('uid', null, {domain: ctx.config.domain})

        returnUrl ? ctx.redirect(returnUrl) : ctx.success(true)
    }
}

const generateJwtPayload = (userId, token) => {

    const currTime = Math.round(new Date().getTime() / 1000)

    return {
        iss: "https://identity.freelog.com",
        sub: userId.toString(),
        aud: "freelog-website",
        exp: currTime + 1296000,
        iat: currTime,
        jti: token
    }
}

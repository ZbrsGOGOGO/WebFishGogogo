import type { EntityManager } from 'typeorm';
import { queueOfficeSocialAwards } from './office-social-awards';
describe('bounded legacy drawing social award generation',()=>{
    afterEach(()=>jest.restoreAllMocks());
    it('takes unique recipient advisory locks in the same stable key order for opposite drawing pairs, without locking users/profiles',async()=>{
        const run=async(reverse:boolean)=>{
            const query=jest.fn().mockResolvedValue([]);
            const awards=[{userId:'user-a',source:'guess:post',points:10},{userId:'user-b',source:'draw:post:user-a',points:5}];
            await queueOfficeSocialAwards({query} as unknown as EntityManager,reverse?awards.reverse():awards);
            expect(query.mock.calls.some(([sql])=>/FOR (UPDATE|NO KEY UPDATE|KEY SHARE)/.test(sql))).toBe(false);
            return query.mock.calls.filter(([sql])=>sql.startsWith('SELECT pg_advisory')).map(([,args])=>args[0]);
        };
        expect(await run(false)).toEqual(await run(true));
    });
    it('guards pending capacity and includes claimed rows in the current Beijing-day generation budget',async()=>{
        const now=Date.parse('2026-09-15T10:00:00+08:00');jest.spyOn(Date,'now').mockReturnValue(now);
        const query=jest.fn().mockImplementation(async(sql:string)=>sql.startsWith('INSERT')?[{user_id:'user-a'}]:[]);
        expect(await queueOfficeSocialAwards({query} as unknown as EntityManager,[{userId:'user-a',source:'guess:post',points:10}],now)).toEqual([true]);
        const [sql,args]=query.mock.calls.find(([sql])=>sql.startsWith('INSERT'))!;
        expect(sql).toContain('claimed=false');expect(sql).toContain('COALESCE(sum(points),0)');
        // PostgreSQL SUM(integer) is bigint; the INSERT target is integer.
        // A reused uncast parameter otherwise produces 42P08 in real PG.
        expect(sql).toContain('SELECT id,$2,$3::integer,$4');
        expect(sql).toContain(')+$3::integer <= $9::integer');
        expect(sql.split('COALESCE(sum(points),0)')[1]).not.toContain('claimed=false');
        expect(args[4]).toBe(200);expect(args[5]).toBe(true);expect(args[8]).toBe(100);
        expect((args[6] as Date).toISOString()).toBe('2026-09-14T16:00:00.000Z');
        expect((args[7] as Date).toISOString()).toBe('2026-09-15T16:00:00.000Z');
    });
    it('uses the clock after an advisory wait across midnight and never generates an award for a missing recipient',async()=>{
        let now=Date.parse('2026-09-15T23:59:59+08:00');jest.spyOn(Date,'now').mockImplementation(()=>now);
        const query=jest.fn().mockImplementation(async(sql:string)=>{if(sql.startsWith('SELECT pg_advisory'))now+=2000;return [];});
        const result=await queueOfficeSocialAwards({query} as unknown as EntityManager,[{userId:null,source:'draw:deleted',points:5},{userId:'user-a',source:'guess:post',points:10}],now);
        expect(result).toEqual([false,false]);
        const [,args]=query.mock.calls.find(([sql])=>sql.startsWith('INSERT'))!;
        expect((args[6] as Date).toISOString()).toBe('2026-09-15T16:00:00.000Z');
    });
});

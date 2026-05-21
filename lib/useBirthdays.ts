import { useState, useEffect, useCallback } from 'react';
import { supabase } from './supabase';

export type BirthdayMember = {
  id: string;
  nome: string;
  sobrenome: string;
  data_nascimento: string;
  telefone: string;
  idade: number;
};

export function useBirthdays() {
  const [todayBirthdays, setTodayBirthdays] = useState<BirthdayMember[]>([]);
  const [monthBirthdays, setMonthBirthdays] = useState<BirthdayMember[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchBirthdays = useCallback(async () => {
    const today = new Date();
    const todayMonth = String(today.getMonth() + 1).padStart(2, '0');
    const todayDay = String(today.getDate()).padStart(2, '0');

    const { data, error } = await supabase
      .from('members')
      .select('id, nome, sobrenome, data_nascimento, telefone')
      .not('data_nascimento', 'is', null);

    if (error || !data) { setLoading(false); return; }

    const withAge = data
      .filter((m: any) => m.data_nascimento)
      .map((m: any) => {
        const dob = new Date(m.data_nascimento);
        const month = String(dob.getMonth() + 1).padStart(2, '0');
        const day = String(dob.getDate()).padStart(2, '0');
        const age = today.getFullYear() - dob.getFullYear();
        return { ...m, _month: month, _day: day, idade: age };
      });

    // Aniversários de hoje
    const todays = withAge.filter(m => m._month === todayMonth && m._day === todayDay);
    // Aniversários do mês
    const months = withAge.filter(m => m._month === todayMonth).sort((a, b) => Number(a._day) - Number(b._day));

    setTodayBirthdays(todays as BirthdayMember[]);
    setMonthBirthdays(months as BirthdayMember[]);
    setLoading(false);
  }, []);

  useEffect(() => { fetchBirthdays(); }, [fetchBirthdays]);

  return { todayBirthdays, monthBirthdays, loading, refetch: fetchBirthdays };
}

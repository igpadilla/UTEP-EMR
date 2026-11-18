const { createClient } = require('@supabase/supabase-js');

// Constants from local supabase setup
const SUPABASE_URL = 'http://127.0.0.1:54321';
const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});

const DEFAULT_PASSWORD = 'Test12345';

async function seed() {
  console.log('Seeding database...');

  const users = [
    { email: 'admin@test.com', firstName: 'System', lastName: 'Admin', role: 'admin' },
    { email: 'instructor@test.com', firstName: 'Jane', lastName: 'Instructor', role: 'instructor' },
    { email: 'student@test.com', firstName: 'John', lastName: 'Student', role: 'student', clinicalRole: 'pharmacy' },
    { email: 'pt.student@test.com', firstName: 'Sam', lastName: 'PT Student', role: 'student', clinicalRole: 'physical_therapy' },
    { email: 'nurs.student1@test.com', firstName: 'Alice', lastName: 'Nguyen', role: 'student', clinicalRole: 'nursing' },
    { email: 'nurs.student2@test.com', firstName: 'Brian', lastName: 'Ortega', role: 'student', clinicalRole: 'nursing' },
    { email: 'nurs.student3@test.com', firstName: 'Carmen', lastName: 'Torres', role: 'student', clinicalRole: 'nursing' },
    { email: 'nurs.student4@test.com', firstName: 'David', lastName: 'Kim', role: 'student', clinicalRole: 'nursing' },
    { email: 'nurs.student5@test.com', firstName: 'Elena', lastName: 'Patel', role: 'student', clinicalRole: 'nursing' },
    { email: 'nurs.student6@test.com', firstName: 'Frank', lastName: 'Rivera', role: 'student', clinicalRole: 'nursing' },
  ];

  for (const u of users) {
    console.log(`Creating user ${u.email}...`);
    // 1. Create Auth User
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email: u.email,
      password: DEFAULT_PASSWORD,
      email_confirm: true
    });

    let userId;

    if (authError) {
      if (authError.message.includes('already registered') || authError.message.includes('already been registered')) {
        // User exists in auth — look up their ID so we can still update the profile
        const { data: list, error: listError } = await supabase.auth.admin.listUsers();
        if (listError) {
          console.error(`Could not list users to find ${u.email}:`, listError.message);
          continue;
        }
        const existing = list.users.find((usr) => usr.email === u.email);
        if (!existing) {
          console.error(`Could not find existing user for ${u.email}`);
          continue;
        }
        userId = existing.id;
        console.log(`User ${u.email} already exists, ensuring profile is up to date...`);
      } else {
        console.error(`Error creating ${u.email}:`, authError.message);
        continue;
      }
    } else {
      userId = authData.user.id;
    }

    // 2. Upsert Profile — works whether the profile row exists or not
    const { error: profileError } = await supabase
      .from('profiles')
      .upsert({
        user_id: userId,
        first_name: u.firstName,
        last_name: u.lastName,
        account_type: u.role,
        active: true
      }, { onConflict: 'user_id' });

    if (profileError) {
      console.error(`Error updating profile for ${u.email}:`, profileError.message);
    } else {
      console.log(`Profile updated for ${u.email}.`);
    }

    // 3. Assign clinical role when specified
    if (u.clinicalRole) {
      const { data: roleData, error: roleError } = await supabase
        .from('roles')
        .select('role_id')
        .eq('role_name', u.clinicalRole)
        .single();

      if (roleError) {
        console.error(`Error finding clinical role ${u.clinicalRole}:`, roleError.message);
        continue;
      }

      const { error: assignmentError } = await supabase
        .from('profile_roles')
        .upsert(
          { user_id: userId, role_id: roleData.role_id },
          { onConflict: 'user_id,role_id' }
        );

      if (assignmentError) {
        console.error(`Error assigning ${u.clinicalRole} to ${u.email}:`, assignmentError.message);
      } else {
        console.log(`Clinical role ${u.clinicalRole} assigned to ${u.email}.`);
      }
    }
  }

  // Seed sample patient
  console.log('Creating sample patient...');
  const { data: patient, error: patientError } = await supabase
    .from('patients')
    .insert([
      {
        first_name: 'John',
        last_name: 'Doe',
        age: 45,
        sex: 'Male',
        occupation: 'Software Engineer',
        current_medications: [{ medicine: { name: "Lisinopril", unit: "mg" }, dosage: 10, frequency: 1 }],
        last_visit: '2026-09-01',
        last_visit_notes: 'Patient complained of mild headaches.'
      }
    ])
    .select()
    .single();

  if (patientError) {
    console.error('Error creating patient:', patientError.message);
  } else {
    console.log('Sample patient created with ID:', patient.id);

    // Seed sample visit
    console.log('Creating sample visit...');
    const { error: visitError } = await supabase
      .from('visits')
      .insert([
        {
          patient_id: patient.id,
          visit_type: 'Initial Consultation',
          notes: 'Patient discussed ongoing back pain and requested physical therapy referral.',
          medications: 'Ibuprofen as needed'
        }
      ]);

    if (visitError) console.error('Error creating visit:', visitError.message);
    else console.log('Sample visit created.');

    // Seed sample appointment
    console.log('Creating sample appointment...');
    const { error: apptError } = await supabase
      .from('appointments')
      .insert([
        {
          patient_id: patient.id,
          appointment_type: 'Follow-up',
          scheduled_date: '2026-10-15',
          scheduled_time: '14:30:00',
          notes: 'Check progress on back pain therapy.',
          status: 'scheduled'
        }
      ]);

    if (apptError) console.error('Error creating appointment:', apptError.message);
    else console.log('Sample appointment created.');
  }

  // Seed course + enrollment
  console.log('Looking up instructor and student IDs...');
  const { data: userListForCourse } = await supabase.auth.admin.listUsers();
  const instructorForCourse = userListForCourse?.users?.find(u => u.email === 'instructor@test.com');
  const studentForCourse = userListForCourse?.users?.find(u => u.email === 'student@test.com');

  const ptStudentForCourse = userListForCourse?.users?.find(u => u.email === 'pt.student@test.com');

  if (instructorForCourse && studentForCourse) {
    console.log('Creating PHARM 4301 course...');
    const { data: pharmCourse, error: pharmCourseError } = await supabase
      .from('courses')
      .upsert(
        { instructor_id: instructorForCourse.id, course_number: 'PHARM 4301', crn: '11234', discipline: 'pharmacy' },
        { onConflict: 'instructor_id,crn', ignoreDuplicates: false }
      )
      .select('id')
      .single();

    if (pharmCourseError) {
      console.error('Error creating PHARM course:', pharmCourseError.message);
    } else {
      console.log('PHARM 4301 created with ID:', pharmCourse.id);
      const { error: enrollError } = await supabase
        .from('course_enrollments')
        .upsert(
          { course_id: pharmCourse.id, student_id: studentForCourse.id, enrolled_by: instructorForCourse.id },
          { onConflict: 'course_id,student_id', ignoreDuplicates: true }
        );
      if (enrollError) console.error('Error enrolling student@test.com:', enrollError.message);
      else console.log('student@test.com enrolled in PHARM 4301.');
    }

    if (ptStudentForCourse) {
      console.log('Creating PT 3301 course...');
      const { data: ptCourse, error: ptCourseError } = await supabase
        .from('courses')
        .upsert(
          { instructor_id: instructorForCourse.id, course_number: 'PT 3301', crn: '22345', discipline: 'physical_therapy' },
          { onConflict: 'instructor_id,crn', ignoreDuplicates: false }
        )
        .select('id')
        .single();

      if (ptCourseError) {
        console.error('Error creating PT course:', ptCourseError.message);
      } else {
        console.log('PT 3301 created with ID:', ptCourse.id);
        const { error: ptEnrollError } = await supabase
          .from('course_enrollments')
          .upsert(
            { course_id: ptCourse.id, student_id: ptStudentForCourse.id, enrolled_by: instructorForCourse.id },
            { onConflict: 'course_id,student_id', ignoreDuplicates: true }
          );
        if (ptEnrollError) console.error('Error enrolling pt.student@test.com:', ptEnrollError.message);
        else console.log('pt.student@test.com enrolled in PT 3301.');
      }
    }

    // Seed NURS 3310 course
    console.log('Creating NURS 3310 course...');
    const { data: nursCourse, error: nursCourseError } = await supabase
      .from('courses')
      .upsert(
        { instructor_id: instructorForCourse.id, course_number: 'NURS 3310', crn: '33456', discipline: 'nursing' },
        { onConflict: 'instructor_id,crn', ignoreDuplicates: false }
      )
      .select('id')
      .single();

    if (nursCourseError) {
      console.error('Error creating NURS course:', nursCourseError.message);
    } else {
      console.log('NURS 3310 created with ID:', nursCourse.id);

      // Enroll 6 nursing students
      const nursStudentEmails = [
        'nurs.student1@test.com', 'nurs.student2@test.com', 'nurs.student3@test.com',
        'nurs.student4@test.com', 'nurs.student5@test.com', 'nurs.student6@test.com',
      ];
      const { data: allUsers } = await supabase.auth.admin.listUsers();
      for (const email of nursStudentEmails) {
        const nursStudent = allUsers?.users?.find(u => u.email === email);
        if (!nursStudent) { console.error(`Could not find ${email}`); continue; }
        const { error: enrollErr } = await supabase
          .from('course_enrollments')
          .upsert(
            { course_id: nursCourse.id, student_id: nursStudent.id, enrolled_by: instructorForCourse.id },
            { onConflict: 'course_id,student_id', ignoreDuplicates: true }
          );
        if (enrollErr) console.error(`Error enrolling ${email}:`, enrollErr.message);
        else console.log(`${email} enrolled in NURS 3310.`);
      }

      // Seed 4 nursing patients
      const nursPatients = [
        {
          first_name: 'Margaret', last_name: 'Sullivan', age: 72, sex: 'Female',
          occupation: 'Retired Teacher',
          current_medications: [{ medicine: { name: 'Warfarin', unit: 'mg' }, dosage: 5, frequency: 1 }],
          last_visit: '2026-10-01', last_visit_notes: 'Admitted for hip fracture post-fall.'
        },
        {
          first_name: 'Carlos', last_name: 'Mendez', age: 54, sex: 'Male',
          occupation: 'Construction Worker',
          current_medications: [{ medicine: { name: 'Insulin Glargine', unit: 'units' }, dosage: 20, frequency: 1 }],
          last_visit: '2026-10-05', last_visit_notes: 'Admitted for diabetic foot ulcer management.'
        },
        {
          first_name: 'Linda', last_name: 'Washington', age: 38, sex: 'Female',
          occupation: 'Accountant',
          current_medications: [{ medicine: { name: 'Albuterol', unit: 'mcg' }, dosage: 90, frequency: 4 }],
          last_visit: '2026-10-10', last_visit_notes: 'Admitted for acute asthma exacerbation.'
        },
        {
          first_name: 'Raymond', last_name: 'Chen', age: 65, sex: 'Male',
          occupation: 'Engineer',
          current_medications: [{ medicine: { name: 'Furosemide', unit: 'mg' }, dosage: 40, frequency: 1 }],
          last_visit: '2026-10-12', last_visit_notes: 'Admitted for decompensated heart failure.'
        },
      ];

      for (const p of nursPatients) {
        const { data: np, error: npErr } = await supabase.from('patients').insert([p]).select().single();
        if (npErr) console.error(`Error creating patient ${p.first_name} ${p.last_name}:`, npErr.message);
        else console.log(`NURS patient created: ${np.first_name} ${np.last_name} (${np.id})`);
      }
    }
  }  // end if (instructorForCourse && studentForCourse)

  // Seed template + case assignment
  console.log('Looking up instructor and student IDs...');
  const { data: userList } = await supabase.auth.admin.listUsers();
  const instructorUser = userList?.users?.find(u => u.email === 'instructor@test.com');
  const studentUser = userList?.users?.find(u => u.email === 'student@test.com');

  // Look up the sample course so case assignment can reference it
  const { data: sampleCourse } = await supabase
    .from('courses')
    .select('id')
    .eq('crn', '11234')
    .maybeSingle();

  if (instructorUser && studentUser) {
    console.log('Creating sample template...');
    const { data: template, error: templateError } = await supabase
      .from('patient_templates')
      .insert({
        instructor_id: instructorUser.id,
        title: 'Chest Pain — Rule Out ACS',
        target_year: 'P2',
        discipline: 'Pharmacotherapy',
        first_name: 'Maria',
        last_name: 'Garcia',
        age: 58,
        sex: 'Female',
        occupation: 'Teacher',
        chief_complaint: 'Chest pain radiating to the left arm for the past 2 hours.',
        clinical_baseline: {
          'BP': '158/94 mmHg',
          'HR': '102 bpm',
          'RR': '18 breaths/min',
          'Temp': '37.1°C',
          'O2 Sat': '96% on room air',
          'Troponin I': '0.08 ng/mL (elevated)',
          'BNP': '210 pg/mL',
        },
        student_instructions: 'You are a pharmacy student on rotation in the emergency department. The patient was brought in by ambulance. Review her history, assess her medications, and document your clinical reasoning and recommended pharmacotherapy plan.',
        hidden_diagnosis: 'NSTEMI — Non-ST-elevation myocardial infarction',
        expectations_rubric: '1. Identify the likely diagnosis based on vitals and labs\n2. List at least 3 drug therapy recommendations with rationale\n3. Note any drug interactions or contraindications\n4. Document monitoring parameters for chosen therapies',
        allergies: ['Penicillin'],
        medical_history: ['Hypertension', 'Type 2 Diabetes', 'Hyperlipidemia'],
        current_medications: [
          { medicine: { name: 'Metformin', unit: 'mg' }, dosage: 500, frequency: 2 },
          { medicine: { name: 'Atorvastatin', unit: 'mg' }, dosage: 40, frequency: 1 },
          { medicine: { name: 'Amlodipine', unit: 'mg' }, dosage: 5, frequency: 1 },
        ],
      })
      .select()
      .single();

    if (templateError) {
      console.error('Error creating template:', templateError.message);
    } else {
      console.log('Sample template created with ID:', template.id);

      const patientSnapshot = {
        first_name: template.first_name,
        last_name: template.last_name,
        age: template.age,
        sex: template.sex,
        occupation: template.occupation,
        chief_complaint: template.chief_complaint,
        clinical_baseline: template.clinical_baseline,
        allergies: template.allergies,
        medical_history: template.medical_history,
        current_medications: template.current_medications,
        student_instructions: template.student_instructions,
        expectations_rubric: template.expectations_rubric,
      };

      console.log('Assigning case to student...');
      const { error: caseError } = await supabase
        .from('assigned_cases')
        .insert({
          template_id: template.id,
          student_id: studentUser.id,
          assigned_by: instructorUser.id,
          patient_snapshot: patientSnapshot,
          due_date: '2026-10-15',
          assignment_notes: 'Focus on antiplatelet and anticoagulation therapy options.',
          course_id: sampleCourse?.id ?? null,
        });

      if (caseError) console.error('Error assigning case:', caseError.message);
      else console.log('Case assigned to student@test.com.');
    }
  } else {
    console.error('Could not find instructor or student user — skipping template/case seed.');
  }

  // Seed nursing templates for NURS 3310
  console.log('Seeding NURS 3310 templates...');
  const { data: nursCourseForTemplates } = await supabase
    .from('courses')
    .select('id')
    .eq('crn', '33456')
    .maybeSingle();

  const { data: instructorForTemplates } = await supabase.auth.admin.listUsers()
    .then(({ data }) => ({ data: data?.users?.find(u => u.email === 'instructor@test.com') }));

  if (instructorForTemplates && nursCourseForTemplates) {
    const nursTemplates = [
      {
        title: 'Post-Op Hip Replacement — Fall Risk Assessment',
        discipline: 'nursing',
        course_id: nursCourseForTemplates.id,
        instructor_id: instructorForTemplates.id,
        first_name: 'Margaret', last_name: 'Sullivan', age: 72, sex: 'Female',
        occupation: 'Retired Teacher',
        chief_complaint: 'Day 1 post-op right hip replacement. Patient is confused and attempting to get out of bed unassisted.',
        clinical_baseline: {
          'BP': '138/82 mmHg', 'HR': '88 bpm', 'RR': '16 breaths/min',
          'Temp': '37.4°C', 'O2 Sat': '95% on 2L NC', 'Pain Score': '7/10',
        },
        hidden_diagnosis: 'Post-operative delirium with high fall risk',
        student_instructions: 'You are a nursing student on a surgical floor. Your patient is 1 day post-op and showing signs of confusion. Perform a fall risk assessment, implement appropriate safety measures, and document your findings.',
        expectations_rubric: '1. Complete a fall risk assessment (Morse Fall Scale)\n2. Implement at least 3 fall prevention interventions\n3. Assess for post-operative delirium using CAM tool\n4. Notify provider with SBAR communication\n5. Document interventions in nursing note',
        allergies: ['Codeine'],
        medical_history: ['Osteoporosis', 'Hypertension', 'Mild cognitive impairment'],
        current_medications: [
          { medicine: { name: 'Warfarin', unit: 'mg' }, dosage: 5, frequency: 1 },
          { medicine: { name: 'Oxycodone', unit: 'mg' }, dosage: 5, frequency: 4 },
          { medicine: { name: 'Ondansetron', unit: 'mg' }, dosage: 4, frequency: 3 },
        ],
      },
      {
        title: 'Diabetic Foot Ulcer — Wound Care & Glucose Management',
        discipline: 'nursing',
        course_id: nursCourseForTemplates.id,
        instructor_id: instructorForTemplates.id,
        first_name: 'Carlos', last_name: 'Mendez', age: 54, sex: 'Male',
        occupation: 'Construction Worker',
        chief_complaint: 'Non-healing wound on plantar surface of left foot for 3 weeks. Wound is 3cm × 2cm with yellow slough and surrounding erythema.',
        clinical_baseline: {
          'BP': '148/90 mmHg', 'HR': '94 bpm', 'RR': '18 breaths/min',
          'Temp': '38.1°C', 'O2 Sat': '97% on room air',
          'Blood Glucose': '312 mg/dL', 'HbA1c': '10.2%',
        },
        hidden_diagnosis: 'Infected diabetic foot ulcer (Wagner Grade 2) with poorly controlled Type 2 DM',
        student_instructions: 'You are a nursing student on a medical-surgical floor. Perform a wound assessment, provide appropriate wound care, and address the patient\'s elevated blood glucose. The patient admits to not checking his glucose regularly.',
        expectations_rubric: '1. Perform and document a complete wound assessment\n2. Select appropriate wound dressing and provide rationale\n3. Administer insulin per sliding scale and document\n4. Provide diabetes self-management education\n5. Identify signs of infection and escalate appropriately',
        allergies: ['Sulfa drugs'],
        medical_history: ['Type 2 Diabetes (12 years)', 'Peripheral neuropathy', 'Hypertension', 'Obesity'],
        current_medications: [
          { medicine: { name: 'Insulin Glargine', unit: 'units' }, dosage: 20, frequency: 1 },
          { medicine: { name: 'Metformin', unit: 'mg' }, dosage: 1000, frequency: 2 },
          { medicine: { name: 'Lisinopril', unit: 'mg' }, dosage: 10, frequency: 1 },
        ],
      },
      {
        title: 'Acute Asthma Exacerbation — Respiratory Assessment',
        discipline: 'nursing',
        course_id: nursCourseForTemplates.id,
        instructor_id: instructorForTemplates.id,
        first_name: 'Linda', last_name: 'Washington', age: 38, sex: 'Female',
        occupation: 'Accountant',
        chief_complaint: 'Severe shortness of breath and wheezing for 4 hours. Patient unable to complete full sentences. Home nebulizer treatments not providing relief.',
        clinical_baseline: {
          'BP': '142/88 mmHg', 'HR': '112 bpm', 'RR': '28 breaths/min',
          'Temp': '37.0°C', 'O2 Sat': '89% on room air', 'Peak Flow': '42% predicted',
        },
        hidden_diagnosis: 'Severe acute asthma exacerbation',
        student_instructions: 'You are a nursing student in the emergency department. Your patient is in respiratory distress. Perform a respiratory assessment, initiate oxygen therapy, prepare and administer ordered bronchodilators, and monitor response to treatment.',
        expectations_rubric: '1. Perform a complete respiratory assessment including auscultation findings\n2. Initiate and titrate oxygen therapy to target SpO2 ≥ 95%\n3. Administer nebulized albuterol and document patient response\n4. Identify signs of respiratory failure requiring escalation\n5. Educate patient on asthma action plan and inhaler technique',
        allergies: ['Aspirin', 'NSAIDs'],
        medical_history: ['Asthma (since childhood)', 'Allergic rhinitis', 'Eczema'],
        current_medications: [
          { medicine: { name: 'Albuterol', unit: 'mcg' }, dosage: 90, frequency: 4 },
          { medicine: { name: 'Fluticasone', unit: 'mcg' }, dosage: 220, frequency: 2 },
          { medicine: { name: 'Montelukast', unit: 'mg' }, dosage: 10, frequency: 1 },
        ],
      },
    ];

    for (const tmpl of nursTemplates) {
      const { data: t, error: tErr } = await supabase
        .from('patient_templates')
        .insert(tmpl)
        .select('id, title')
        .single();
      if (tErr) console.error(`Error creating template "${tmpl.title}":`, tErr.message);
      else console.log(`NURS template created: "${t.title}" (${t.id})`);
    }
  } else {
    console.error('Could not find instructor or NURS course — skipping nursing templates.');
  }

  console.log('Seeding complete!');
}

seed().catch(err => console.error('Unexpected error:', err));
